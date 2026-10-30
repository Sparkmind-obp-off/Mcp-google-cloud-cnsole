import { configuration } from '../worker/src/security.js';
const config = configuration(process.env);
const gates = [
  'Live Neon connection and applied migrations have not been verified',
  'Live Google OAuth consent, identity binding, refresh and revocation have not been verified',
  'External MCP authorization server and actual MCP client connection have not been verified',
  'Google Cloud read tools have not been tested against an authorized real project',
  'Independent human approval UI and Google write executor are not implemented',
  'Native MCP 2026 request-metadata protocol is not implemented (SDK supports through 2025-11-25)',
  'Production security review and controlled write integration test have not been completed'
];
console.log(JSON.stringify({
  productionReady: false,
  configuration: { missing: config.missing, invalid: config.invalid },
  unverifiedReleaseGates: gates,
  productionDeployAllowed: false
}, null, 2));
// Deliberately cannot be bypassed by adding environment variables alone.
process.exitCode = 2;
