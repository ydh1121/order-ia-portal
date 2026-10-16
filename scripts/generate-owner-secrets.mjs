/** Run LOCALLY, never paste the generated values into ChatGPT or Git. */
import {randomBytes,webcrypto} from 'node:crypto';
import {deriveVerifier} from '../src/server/owner-session.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const password=randomBytes(30).toString('base64url');
const verifier=await deriveVerifier(password);
const key=randomBytes(32).toString('base64url');
process.stdout.write('Store the one-time password in your own password manager. Do not save this output in a repository, file or chat.\n\n');
process.stdout.write('One-time owner password: '+password+'\n\n');
process.stdout.write('Encrypted Pages secret IA_OWNER_PASSWORD_VERIFIER: '+verifier+'\n');
process.stdout.write('Encrypted Pages secret IA_OWNER_SESSION_KEY: '+key+'\n');
process.stdout.write('Encrypted Pages secret IA_OWNER_LOGIN_ENABLED: true\n');
process.stdout.write('Set IA_OWNER_EMAIL to your exact own address. Rotate both credentials if output leaks.\n');
