-- Neon PostgreSQL only. Never automatically applied by the Worker.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_issuer text NOT NULL,
  auth_subject text NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(auth_issuer, auth_subject)
);
CREATE TABLE oauth_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  google_subject text NOT NULL,
  encrypted_tokens text NOT NULL CHECK (encrypted_tokens LIKE 'v1.%'),
  scopes text[] NOT NULL,
  token_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(user_id, google_subject),
  UNIQUE(user_id, id)
);
CREATE TABLE oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  state_hash text UNIQUE NOT NULL,
  browser_hash text NOT NULL,
  encrypted_verifier text NOT NULL CHECK (encrypted_verifier LIKE 'v1.%'),
  nonce text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK(expires_at > created_at)
);
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  connection_id uuid NOT NULL,
  google_project_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id, connection_id) REFERENCES oauth_connections(user_id, id),
  UNIQUE(user_id, connection_id, google_project_id),
  UNIQUE(user_id, connection_id, id)
);
CREATE TABLE project_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  connection_id uuid NOT NULL,
  project_id uuid NOT NULL,
  permission text NOT NULL CHECK(permission = 'read'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id, connection_id, project_id) REFERENCES projects(user_id, connection_id, id),
  UNIQUE(user_id, project_id, permission)
);
CREATE TABLE pending_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  connection_id uuid NOT NULL,
  project_id uuid NOT NULL,
  operation_type text NOT NULL CHECK(operation_type IN ('compute.start', 'compute.stop')),
  target text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  resource_state_hash text NOT NULL,
  status text NOT NULL DEFAULT 'previewed' CHECK(status IN ('previewed', 'approved', 'rejected', 'executing', 'succeeded', 'failed', 'expired', 'stale', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  executed_at timestamptz,
  FOREIGN KEY(user_id, connection_id, project_id) REFERENCES projects(user_id, connection_id, id),
  UNIQUE(user_id, connection_id, id),
  UNIQUE(id, user_id, connection_id, project_id, operation_type, target, payload_hash, expires_at),
  CHECK(expires_at > created_at)
);
CREATE TABLE approval_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  connection_id uuid NOT NULL,
  project_id uuid NOT NULL,
  operation_type text NOT NULL,
  target text NOT NULL,
  payload_hash text NOT NULL,
  decision text NOT NULL CHECK(decision IN ('approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  FOREIGN KEY(operation_id, user_id, connection_id, project_id, operation_type, target, payload_hash, expires_at)
    REFERENCES pending_operations(id, user_id, connection_id, project_id, operation_type, target, payload_hash, expires_at)
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  connection_id uuid,
  operation_id uuid,
  action text NOT NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id, connection_id) REFERENCES oauth_connections(user_id, id),
  FOREIGN KEY(user_id, connection_id, operation_id) REFERENCES pending_operations(user_id, connection_id, id)
);
CREATE TABLE security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE connector_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  setting_key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, setting_key)
);
CREATE TABLE rate_limits (
  bucket_hash text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK(request_count > 0)
);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);
CREATE INDEX oauth_connections_user_active ON oauth_connections(user_id) WHERE revoked_at IS NULL;
CREATE INDEX projects_user ON projects(user_id, connection_id);
CREATE INDEX project_permissions_user ON project_permissions(user_id, project_id);
CREATE INDEX pending_operations_expiry ON pending_operations(user_id, status, expires_at);
CREATE INDEX audit_events_user_time ON audit_events(user_id, created_at DESC);
CREATE INDEX security_events_user_time ON security_events(user_id, created_at DESC);
CREATE INDEX rate_limits_expiry ON rate_limits(window_start);
-- Preview identity and payload must not be changed after insertion.
CREATE FUNCTION protect_operation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.user_id, NEW.connection_id, NEW.project_id, NEW.operation_type, NEW.target, NEW.payload, NEW.payload_hash, NEW.resource_state_hash, NEW.created_at, NEW.expires_at)
     IS DISTINCT FROM ROW(OLD.user_id, OLD.connection_id, OLD.project_id, OLD.operation_type, OLD.target, OLD.payload, OLD.payload_hash, OLD.resource_state_hash, OLD.created_at, OLD.expires_at) THEN
    RAISE EXCEPTION 'operation identity is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER pending_operation_immutable BEFORE UPDATE ON pending_operations FOR EACH ROW EXECUTE FUNCTION protect_operation_identity();

CREATE FUNCTION protect_approval_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.operation_id,NEW.user_id,NEW.connection_id,NEW.project_id,NEW.operation_type,NEW.target,NEW.payload_hash,NEW.decision,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.operation_id,OLD.user_id,OLD.connection_id,OLD.project_id,OLD.operation_type,OLD.target,OLD.payload_hash,OLD.decision,OLD.created_at,OLD.expires_at)
    OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at) THEN
    RAISE EXCEPTION 'approval identity is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER approval_identity_immutable BEFORE UPDATE ON approval_records FOR EACH ROW EXECUTE FUNCTION protect_approval_identity();

CREATE FUNCTION prohibit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'security and audit events are append-only';
END; $$;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION prohibit_event_mutation();
CREATE TRIGGER security_events_append_only BEFORE UPDATE OR DELETE ON security_events FOR EACH ROW EXECUTE FUNCTION prohibit_event_mutation();
