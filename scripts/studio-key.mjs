import {randomBytes,createHash} from 'node:crypto';
const key=randomBytes(32).toString('base64url');
console.log('Save this studio access key in your password manager. Do not commit it:');
console.log(key);
console.log('\nSet this Railway variable (the original key cannot be recovered from it):');
console.log('STUDIO_ACCESS_KEY_SHA256='+createHash('sha256').update(key).digest('hex'));
