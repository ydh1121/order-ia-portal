// Existing Cloudflare Pages project only; this route is fail-closed unless OWNER configures
// Access verification + IA roles + least-privilege Google secrets independently.
// Do not return private data to anonymous users or serve src/internal as static assets.
import {handleIaRequest} from '../../../src/server/router.mjs';
export const onRequest = ({request,env}) => handleIaRequest(request,env);
