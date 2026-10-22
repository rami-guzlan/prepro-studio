/* Owner tools for the hosted version, run from a developer machine that is
   signed in with `gcloud auth login` (same environment variables as the server).

     node scripts/cloud-admin.mjs owner-link     sign-in link for OWNER_EMAIL (first sign-in or a forgotten password)
     node scripts/cloud-admin.mjs people         list people and their access

   The link sets a password once and is valid for 7 days. */
import { createStore } from '../server/storage.mjs';
import { createAccess } from '../server/auth.mjs';

const [cmd] = process.argv.slice(2);
const base = (process.env.PUBLIC_URL || 'http://localhost:8080').replace(/\/$/, '');
const store = createStore();
const auth = createAccess(store);

if (cmd === 'owner-link') {
  const email = process.env.OWNER_EMAIL;
  if (!email) throw new Error('Set OWNER_EMAIL');
  const { link } = await auth.invite(base, { email, name: process.env.OWNER_NAME || 'Owner' });
  console.log(link);
} else if (cmd === 'people') {
  for (const p of await auth.people()) console.log(`${p.owner ? 'owner ' : '      '}${p.email.padEnd(36)} ${p.disabled ? 'OFF ' : ''}${JSON.stringify(p.tabs)}`);
} else {
  console.log('Usage: node scripts/cloud-admin.mjs owner-link | people');
  process.exit(1);
}
