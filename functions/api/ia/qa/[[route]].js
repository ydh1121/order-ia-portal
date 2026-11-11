import {handleQaRequest} from '../../../../src/server/qa-api.mjs';
import {createDriveSourceReader} from '../../../../src/server/qa-drive-source.mjs';
/** Same Pages process; construction performs no network or credential export. */
export function onRequest({request,env}){return handleQaRequest(request,env,{readPrivateArtifact:createDriveSourceReader(env)});}
