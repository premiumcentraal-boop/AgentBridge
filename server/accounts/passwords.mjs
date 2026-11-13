import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const options = { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 };
const dummy = 'scrypt$65536$8$2$' + '0'.repeat(32) + '$' + '0'.repeat(128);
let active = 0;
async function key(password, salt) {
  if (active >= 2) { const error = new Error('Please try signing in again in a moment.'); error.status = 429; error.code = 'AUTH_BUSY'; throw error; }
  active++;
  try { return await derive(password, salt, 64, options); } finally { active--; }
}
export const nodePasswords = {
  async hash(password) { const salt = randomBytes(16).toString('hex'), bytes = await key(password, salt); return `scrypt$65536$8$2$${salt}$${bytes.toString('hex')}`; },
  async verify(password, stored) {
    const valid = typeof stored === 'string' && /^scrypt\$65536\$8\$2\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored);
    const fields = (valid ? stored : dummy).split('$');
    const actual = await key(password, fields[4]);
    return valid && timingSafeEqual(actual, Buffer.from(fields[5], 'hex'));
  },
};
