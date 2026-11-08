// Generate a random test token and hashed account SQL. Store the token securely.
import {randomBytes,createHash,randomUUID} from 'node:crypto';
const did=process.argv[2];
if(!did||!(/^\+[1-9]\d{7,14}$/.test(did))){console.error('Usage: node scripts/provision-test-account.mjs +12025550123');process.exit(1)}
const token='ab_'+randomBytes(32).toString('base64url');
const digest=createHash('sha256').update(token).digest('hex');
console.log('SECRET TOKEN, SHOWN ONCE:\n'+token+'\n');
console.log("Run this SQL only against your TEST D1 database:\nINSERT INTO accounts (id,api_key_sha256,did,status) VALUES ('"+randomUUID()+"','"+digest+"','"+did+"','active');");
