import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {publicationIdentity} from '../../src/server/r3-qa-publication.mjs';

// Input is the immutable deployment object from the authenticated Cloudflare Pages GET.
// Production additionally requires the current authenticated project GET so its
// canonical deployment is verified even though production aliases are null.
// Emit one parameterized D1 statement for the release operator. This script has no credentials.
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const deployment = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const sha = deployment.deployment_trigger?.metadata?.commit_hash;
const branch = deployment.deployment_trigger?.metadata?.branch;
const main = deployment.environment === 'production';
const project = main && process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : null;
const expectedAlias = main ? 'https://order-ia-portal.pages.dev' : 'https://feat-ia-r3-private-0585.order-ia-portal.pages.dev';
const expectedBranch = main ? 'main' : 'feat/ia-r3-private-0585';
const correctAlias = main ? project?.name === 'order-ia-portal' &&
  project.subdomain === 'order-ia-portal.pages.dev' && project.production_branch === 'main' &&
  project.canonical_deployment?.id === deployment.id : deployment.aliases?.includes(expectedAlias);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
if (!uuid.test(deployment.id) || !['preview','production'].includes(deployment.environment) || deployment.project_name !== 'order-ia-portal' ||
    deployment.url !== 'https://' + deployment.id.slice(0, 8) + '.order-ia-portal.pages.dev' ||
    !correctAlias || branch !== expectedBranch ||
    deployment.latest_stage?.name !== 'deploy' || deployment.latest_stage?.status !== 'success' ||
    deployment.deployment_trigger.metadata.commit_dirty !== false || !deployment.uses_functions) {
  throw new Error('Expected successful, clean existing IA deployment');
}
if (!/^[0-9a-f]{40}$/.test(sha) || git('rev-parse', 'HEAD') !== sha ||
    git('status', '--porcelain', '--', 'src', 'functions', 'migrations', 'scripts/r3/prepare-publication-receipt.mjs')) {
  throw new Error('Use the clean official IA checkout matching the deployed revision');
}
const {candidateId, catalogDigest, productCommit} = await publicationIdentity();
const sql = 'INSERT INTO qa_publications(candidate_id,catalog_digest,product_commit,ia_commit,deployment_id) VALUES(?,?,?,?,?)';
console.log(JSON.stringify({sql, params: [candidateId + (main ? ':main' : ''), catalogDigest, productCommit, sha, deployment.id]}));
