import { z } from 'zod';
import { fail, payloadHash } from './security.js';

export const operationSchema = z.strictObject({
  connectionId: z.uuid(), projectId: z.string().regex(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/),
  operation: z.enum(['compute.start', 'compute.stop']),
  zone: z.string().regex(/^[a-z]+-[a-z]+[0-9]-[a-z]$/), instance: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/)
});
export async function operationBinding(input, state) {
  const args = operationSchema.parse(input);
  return {
    args,
    target: `projects/${args.projectId}/zones/${args.zone}/instances/${args.instance}`,
    payloadHash: await payloadHash(args),
    resourceStateHash: await payloadHash(state)
  };
}
export async function validateApproval(record, identity, exactPayload, currentState, now = Date.now()) {
  if (record.user_id !== identity.userId || record.connection_id !== identity.connectionId || record.project_id !== identity.projectId) fail('APPROVAL_IDENTITY_MISMATCH', 403);
  if (record.status !== 'approved' || record.consumed_at) fail('APPROVAL_NOT_USABLE', 409);
  if (!Number.isFinite(Date.parse(record.expires_at)) || Date.parse(record.expires_at) <= now) fail('APPROVAL_EXPIRED', 409);
  if (await payloadHash(operationSchema.parse(exactPayload)) !== record.payload_hash) fail('APPROVAL_PAYLOAD_CHANGED', 409);
  if (await payloadHash(currentState) !== record.resource_state_hash) fail('APPROVAL_RESOURCE_CHANGED', 409);
  return true;
}
// Internal persistence primitives only. NOT wired to an HTTP/MCP approval or execution route.
// A separate, verified human-consent boundary must exist before using these in production.
export class ApprovalStore {
  constructor(store) { this.store = store; }
  async preview(userId, projectRowId, input, resourceState) {
    const binding = await operationBinding(input, resourceState);
    const [row] = await this.store.query(`INSERT INTO pending_operations(user_id,connection_id,project_id,operation_type,target,payload,payload_hash,resource_state_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,now()+interval '5 minutes') RETURNING id,expires_at,status`,
    [userId, binding.args.connectionId, projectRowId, binding.args.operation, binding.target, JSON.stringify(binding.args), binding.payloadHash, binding.resourceStateHash]);
    return { ...row, ...binding, executionEnabled: false };
  }
  async decide(userId, operationId, payloadHashValue, decision) {
    if (!['approved', 'rejected'].includes(decision)) fail('INVALID_DECISION', 400);
    // Claim decision and insert immutable identity-bound approval + audit in ONE database statement.
    const rows = await this.store.query(`WITH changed AS (
      UPDATE pending_operations SET status=$4 WHERE id=$1 AND user_id=$2 AND payload_hash=$3
      AND status='previewed' AND expires_at>now() RETURNING *
    ), approval AS (
      INSERT INTO approval_records(operation_id,user_id,connection_id,project_id,operation_type,target,payload_hash,decision,expires_at)
      SELECT id,user_id,connection_id,project_id,operation_type,target,payload_hash,$4,expires_at FROM changed RETURNING operation_id
    ), audited AS (
      INSERT INTO audit_events(user_id,connection_id,operation_id,action,outcome)
      SELECT user_id,connection_id,id,'operation.decision',$4 FROM changed RETURNING id
    ) SELECT operation_id FROM approval`, [operationId, userId, payloadHashValue, decision]);
    if (!rows.length) fail('OPERATION_NOT_APPROVABLE', 409);
    return rows[0];
  }
  async claim(userId, operationId, payloadHashValue, resourceHash) {
    // Conditional status transition serializes concurrent requests. No unbounded retries.
    const rows = await this.store.query(`WITH changed AS (
      UPDATE pending_operations SET status='executing' WHERE id=$1 AND user_id=$2 AND payload_hash=$3
      AND resource_state_hash=$4 AND status='approved' AND expires_at>now()
      AND EXISTS(SELECT 1 FROM approval_records a WHERE a.operation_id=pending_operations.id AND a.user_id=$2
        AND a.payload_hash=$3 AND a.decision='approved' AND a.expires_at>now() AND a.consumed_at IS NULL)
      RETURNING *
    ), consumed AS (
      UPDATE approval_records a SET consumed_at=now() FROM changed c WHERE a.operation_id=c.id RETURNING a.operation_id
    ), audited AS (
      INSERT INTO audit_events(user_id,connection_id,operation_id,action,outcome)
      SELECT user_id,connection_id,id,'operation.claim','executing' FROM changed RETURNING id
    ) SELECT operation_id FROM consumed`, [operationId, userId, payloadHashValue, resourceHash]);
    if (!rows.length) fail('APPROVAL_NOT_USABLE', 409);
    return rows[0];
  }
}
