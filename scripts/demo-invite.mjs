// Run locally to prepare a one-time tester signup invitation for Railway.
// Never commit the resulting token, link or environment hash to source control.
import { randomBytes, createHash } from 'node:crypto';
const origin=new URL(process.argv[2]||'https://agentbridge.victor.ceo');
if(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))throw new Error('Use HTTPS, or a loopback development origin.');
const token=randomBytes(32).toString('hex');
console.log('Set DEMO_SIGNUP_INVITE_SHA256 privately to: '+createHash('sha256').update(token).digest('hex'));
console.log('Private tester invitation (keep this link private): '+origin.origin+'/signup/#invite='+token);
