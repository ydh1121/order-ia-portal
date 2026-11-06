import {handleQaRequest} from '../../../../src/server/qa-api.mjs';
/** OWNER-only catalogue. Private execution provider intentionally not configured; no new Drive scope. */
export function onRequest({request,env}){return handleQaRequest(request,env);}
