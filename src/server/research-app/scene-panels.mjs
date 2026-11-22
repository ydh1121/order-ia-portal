const referenceAttributes = ['for', 'list', 'form', 'headers', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage'];
const escaped = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const disposeValue = value => {if (typeof value === 'function') value(); else if (typeof value?.dispose === 'function') value.dispose(); else value?.destroy?.();};

function prepareScene(root, scene, module, container) {
  const document = root.ownerDocument;
  root.innerHTML = scene.html;
  // A panel uses its real parent header and stack title. Content headers such
  // as calendar controls and the withdrawal confirmation stay in the scene.
  for (const chrome of root.querySelectorAll('.ob-header,.ob-head,.page-head,.page-title,.ops-heading')) chrome.remove();
  for (const brand of root.querySelectorAll('.brand,[data-order-brand-source="canonical"]')) brand.remove();
  for (const inner of root.querySelectorAll('[id="order-single"]')) {inner.removeAttribute('id'); inner.dataset.applicationScene = scene.screen;}
  for (const script of root.querySelectorAll('script')) script.remove();
  for (const css of scene.styles || []) {const style = document.createElement('style'); style.textContent = css; root.prepend(style);}

  const elements = [...root.querySelectorAll('[id]')], ids = new Map(), seen = new Set(), code = String(module?.mount || '');
  for (const node of elements) {if (seen.has(node.id)) throw Error('RESEARCH_PANEL_DUPLICATE_ID:' + node.id); seen.add(node.id);}
  const explicit = scene.preserveIds === true ? null : new Set(scene.preserveIds || []);
  const preserve = id => scene.preserveIds === true || explicit.has(id) || code.includes('#' + id) ||
    new RegExp('\\bgetElementById\\s*\\(\\s*["\']' + escaped(id) + '["\']').test(code) ||
    /\bgetElementById\s*\(\s*[^\s"']/.test(code) || /querySelector(?:All)?\s*\(\s*["']#["']\s*\+/.test(code);
  const base = 'research-scene-' + [scene.screen, scene.state, scene.variant || 'email'].join('-').replace(/[^a-zA-Z0-9_-]/g, '-');
  let prefix = base + '-', suffix = 1;
  while (elements.some(node => {const owner = document.getElementById(prefix + node.id); return owner && !container.contains(owner);})) prefix = base + '-' + (++suffix) + '-';
  for (const node of elements) {
    const original = node.id;
    if (preserve(original)) {
      const owner = document.getElementById(original);
      if (owner && owner !== node && !container.contains(owner)) throw Error('RESEARCH_PANEL_HARDCODED_ID_COLLISION:' + original);
      continue;
    }
    node.dataset.researchSceneId = original; node.id = prefix + original; ids.set(original, node.id);
  }
  const fragment = value => value.startsWith('#') && ids.has(value.slice(1)) ? '#' + ids.get(value.slice(1)) : value;
  const urlReferences = value => value.replace(/url\(\s*(["']?)#([^\s)'"#]+)\1\s*\)/g, (match, quote, id) => ids.has(id) ? 'url(' + quote + '#' + ids.get(id) + quote + ')' : match);
  for (const node of root.querySelectorAll('*')) {
    for (const name of referenceAttributes) if (node.hasAttribute(name)) node.setAttribute(name, node.getAttribute(name).split(/\s+/).map(id => ids.get(id) || id).join(' '));
    for (const name of ['href', 'xlink:href']) if (node.hasAttribute(name)) node.setAttribute(name, fragment(node.getAttribute(name)));
    for (const attribute of [...node.attributes]) if (attribute.value.includes('url(')) node.setAttribute(attribute.name, urlReferences(attribute.value));
    if (node.tagName === 'STYLE') {
      let css = urlReferences(node.textContent);
      for (const [original, id] of ids) css = css.replace(new RegExp('#' + escaped(original) + '(?![a-zA-Z0-9_-])', 'g'), '#' + id);
      node.textContent = css;
    }
  }
  return ids;
}

/** Mount the supplied real scene inside an existing account-stack page. The
 * caller owns routing and data; this boundary owns only DOM/lifetime scoping. */
export function mountResearchScenePanel({container, signal, scene, module, api = {}, services} = {}) {
  if (!container?.ownerDocument) throw TypeError('RESEARCH_SCENE_PANEL_CONTAINER');
  const document = container.ownerDocument, window = document.defaultView, controller = new window.AbortController();
  const root = document.createElement('div'); root.className = 'product-panel-body research-scene-panel ds';
  let disposed = false, runtime = null, shared = null, current = null, connected = false, error = null, blockedSubmit = null;
  const alive = () => !disposed && !controller.signal.aborted && root.parentNode === container;
  const cleanup = () => {
    const ownedRuntime = runtime, ownedShared = shared; runtime = shared = null;
    try {disposeValue(ownedRuntime);} finally {try {disposeValue(ownedShared);} finally {services?.releaseWithin?.(root);}}
  };
  function dispose() {
    if (disposed) return; disposed = true; signal?.removeEventListener('abort', dispose); controller.abort();
    try {cleanup();} finally {if (blockedSubmit) root.removeEventListener('submit', blockedSubmit); if (root.parentNode === container) root.remove();}
  }
  dispose.inspect = () => ({disposed, runtime: connected && !disposed, screen: current?.screen || null, state: current?.state || null, error});
  dispose.refresh = () => alive() && runtime?.refresh?.() === true;
  if (signal?.aborted) {disposed = true; dispose.ready = Promise.resolve(false); return dispose;}
  signal?.addEventListener('abort', dispose, {once: true}); container.replaceChildren(root);
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = '화면을 불러오는 중이에요.'; root.append(status);
  const unconnected = message => {
    root.dataset.researchSceneConnection = 'unconnected'; status.textContent = message; root.prepend(status);
    // The parent app may still bind known state/navigation links. A form with
    // no connected module must not submit to the enclosing document by default.
    if (!blockedSubmit) {blockedSubmit = event => event.preventDefault(); root.addEventListener('submit', blockedSubmit);}
  };
  dispose.ready = (async () => {
    const source = await (typeof scene === 'function' ? scene() : scene);
    if (!alive()) return false;
    if (!source || typeof source.html !== 'string' || !source.screen || !source.state) throw Error('RESEARCH_PANEL_SCENE_MISSING');
    current = source;
    const descriptor = await (typeof module === 'function' ? module(source) : module);
    if (!alive()) return false;
    if (descriptor && descriptor.id !== source.screen) throw Error('RESEARCH_PANEL_RUNTIME_MISMATCH');
    prepareScene(root, source, descriptor, container); root.dataset.appScreen = source.screen; root.dataset.appState = source.state;
    const style = document.createElement('style');
    style.textContent = '.research-scene-panel>.qa-screen{min-height:0;height:auto;max-width:100%;width:100%;overflow:visible}.research-scene-panel>.qa-screen>.page,.research-scene-panel>.page{min-height:0;margin:0;max-width:100%}'; root.prepend(style);
    if (typeof descriptor?.mount !== 'function') {error = 'RESEARCH_PANEL_RUNTIME_MISSING'; unconnected('이 화면의 동작은 아직 서비스에 연결되지 않았어요.'); return false;}
    const mountedApi = {...api, mode: 'product', screen: source.screen, variant: source.variant || api.variant || 'email', signal: controller.signal, module: descriptor};
    shared = window.QAUI?.sharedMount?.(root, mountedApi);
    runtime = window.ORDER_PRODUCT_UI?.mount ? window.ORDER_PRODUCT_UI.mount(descriptor, root, source.state, mountedApi) : descriptor.mount(root, source.state, mountedApi);
    await runtime?.ready;
    if (!alive()) return false;
    connected = true; root.dataset.researchSceneConnection = 'connected'; return true;
  })().catch(failure => {
    if (!alive()) return false;
    error = failure?.message || 'RESEARCH_PANEL_FAILED'; connected = false; controller.abort(); cleanup();
    if (/^RESEARCH_PANEL_(?:DUPLICATE_ID|HARDCODED_ID_COLLISION):/.test(error)) root.replaceChildren();
    unconnected('화면의 동작을 불러오지 못했어요. 다시 열어 주세요.'); return false;
  });
  return dispose;
}
