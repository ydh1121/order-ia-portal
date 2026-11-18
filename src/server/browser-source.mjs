/**
 * Serialize a deliberately self-contained browser function across the Worker boundary.
 * Wrangler preserves function names by adding calls to its module-local __name helper.
 * Function#toString cannot carry that helper into a nonce-authorized browser script.
 * Capture an equivalent helper in this expression's private closure, never on window.
 * All application dependencies still have to be explicit arguments to the function.
 */
export function browserFunction(fn) {
  if (typeof fn !== 'function') throw new TypeError('BROWSER_FUNCTION_REQUIRED');
  const source = Function.prototype.toString.call(fn).replace(/<\/script/gi, '<\\/script');
  return '((__name)=>(' + source + '))((target,value)=>Object.defineProperty(target,"name",{value,configurable:true}))';
}
