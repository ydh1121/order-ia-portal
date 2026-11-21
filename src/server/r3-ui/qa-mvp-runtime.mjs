// Compatibility entry for tests and authoring tools. Browser bundles compose both functions explicitly.
import {registerProductModules} from '../product-ui/modules.mjs';
import {registerQaShowcase} from './qa-showcase-runtime.mjs';
export function registerQaMvp(montages={}){registerProductModules();registerQaShowcase(montages);}
import {browserFunction} from '../browser-source.mjs';
export function getQaMvpRuntimeSource(){return 'function registerQaMvp(montages={}){('+browserFunction(registerProductModules)+')();('+browserFunction(registerQaShowcase)+')(montages);}';}
