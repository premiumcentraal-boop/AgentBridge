// Owner-only: generate an approval token and the SHA-256 to store as OWNER_APPROVAL_TOKEN_SHA256.
// Run on YOUR machine; store the token in a password manager. Never give it to a chat agent or MCP connector.
import {randomBytes,createHash} from 'node:crypto';
const token='owner_'+randomBytes(32).toString('base64url');
console.log('OWNER APPROVAL TOKEN (shown once, keep private):\n'+token+'\n');
console.log('Set this as a Worker secret named OWNER_APPROVAL_TOKEN_SHA256:\n'+createHash('sha256').update(token).digest('hex'));
