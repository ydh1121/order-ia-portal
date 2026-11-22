const ASSET_PREFIX = '/ia/research-assets/';
let sequence = 0;

/** Existing business directory, with regular field controllers at its I/O
 * boundary. The same adapter supplies this panel and the Q3 saved picker. */
export function mountResearchBusinessPanel({container, adapter, services, signal, push, onNavigate, ask, loadModule, initialState = 'list', businessId} = {}) {
  if (!container?.ownerDocument || typeof adapter?.roleRequest !== 'function' || !services) throw TypeError('RESEARCH_BUSINESS_CONTEXT');
  const document = container.ownerDocument, window = document.defaultView, U = window.QAUI;
  const controller = new window.AbortController(), owned = new Set(), cleanup = [], instance = ++sequence;
  let disposed = false, runtime = null, shared = null, confirmation = null, sourceIdentity = null;
  const root = document.createElement('div'); root.className = 'product-panel-body research-business-panel';
  const loading = document.createElement('p'); loading.setAttribute('role', 'status'); loading.textContent = '사업장을 불러오는 중이에요.'; root.append(loading);
  const alive = () => !disposed && !controller.signal.aborted && root.parentNode === container;
  function dispose() {
    if (disposed) return; disposed = true; controller.abort(); signal?.removeEventListener('abort', dispose);
    confirmation?.finish(false); runtime?.dispose(); for (const control of owned) control.dispose();
    services.releaseWithin?.(root); owned.clear(); for (const fn of cleanup) fn(); shared?.();
    if (root.parentNode === container) root.remove();
  }
  dispose.dirty = () => !disposed && !!runtime?.dirty(); dispose.pending = () => !disposed && !!runtime?.pending();
  dispose.beforeLeave = async (context = {}) => {
    if (disposed) return true;
    if (dispose.pending()) {root.querySelector('[data-business-ref="business-status"]').textContent = '저장 결과를 확인한 뒤 화면을 닫아 주세요.'; return false;}
    if (!dispose.dirty()) return true;
    const accepted = await confirm('저장하지 않은 사업장 입력을 닫을까요?', context.confirmationContainer);
    if (!alive()) return false;
    if (dispose.pending()) {root.querySelector('[data-business-ref="business-status"]').textContent = '저장 결과를 확인한 뒤 화면을 닫아 주세요.'; return false;}
    return accepted === true;
  };
  dispose.inspect = () => ({disposed, mounted: !!runtime, dirty: dispose.dirty(), pending: dispose.pending(), source: sourceIdentity});
  if (signal?.aborted) {disposed = true; dispose.ready = Promise.resolve(false); return dispose;}
  signal?.addEventListener('abort', dispose, {once: true}); container.replaceChildren(root);
  const load = loadModule ?? (path => import(ASSET_PREFIX + path));
  const listen = (node, type, callback) => {const handler = event => {if (alive()) callback(event);}; node.addEventListener(type, handler); cleanup.push(() => node.removeEventListener(type, handler));};
  const button = (label, action, callback) => {
    const holder = document.createElement('div');
    if (U?.button) holder.innerHTML = U.button(U.esc(label), action, 'secondary');
    else {const fallback = document.createElement('button'); fallback.type = 'button'; fallback.className = 'btn secondary'; fallback.textContent = label; holder.append(fallback);}
    const result = holder.firstElementChild; listen(result, 'click', callback); return result;
  };
  const confirm = (message, confirmationContainer) => {
    if (!alive()) return Promise.resolve(false); if (ask) return Promise.resolve(ask(message));
    if (confirmation) return confirmation.promise;
    const box = document.createElement('section'); box.className = 'product-panel-confirm'; box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-label', message);
    const text = document.createElement('p'); text.textContent = message;
    const actions = document.createElement('div'); actions.className = 'mf-actions';
    let resolve; const promise = new Promise(done => {resolve = done;}), origin = document.activeElement;
    const finish = value => {if (confirmation?.promise !== promise) return; confirmation = null; box.remove(); if (origin?.isConnected) origin.focus(); resolve(value);};
    const cancel = button('취소', 'research-business-cancel', () => finish(false)), accept = button('확인', 'research-business-confirm', () => finish(true));
    listen(box, 'keydown', event => {
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); finish(false);}
      else if (event.key === 'Tab' && event.shiftKey && document.activeElement === cancel) {event.preventDefault(); accept.focus();}
      else if (event.key === 'Tab' && !event.shiftKey && document.activeElement === accept) {event.preventDefault(); cancel.focus();}
    });
    actions.append(cancel, accept); box.append(text, actions);
    const target = confirmationContainer?.ownerDocument === document && confirmationContainer.isConnected ? confirmationContainer : root;
    target.prepend(box); confirmation = {promise, finish}; cancel.focus(); return promise;
  };

  dispose.ready = (async () => {
    const [module, regions] = await Promise.all([load('bridge/business-directory.mjs'), load('web/region-reference.mjs')]);
    if (!alive()) return false;
    sourceIdentity = module.BUSINESS_SOURCE_IDENTITY; root.innerHTML = module.BUSINESS_PANEL_MARKUP;
    const ids = new Map();
    for (const element of root.querySelectorAll('[id]')) {
      const original = element.id; element.dataset.businessRef = original; element.id = `research-business-${instance}-${original}`; ids.set(original, element.id);
    }
    for (const element of root.querySelectorAll('[for],[aria-labelledby],[aria-describedby],[aria-controls]'))
      for (const attribute of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) if (element.hasAttribute(attribute))
        element.setAttribute(attribute, element.getAttribute(attribute).split(' ').map(value => ids.get(value) ?? value).join(' '));
    const $ = id => root.querySelector('[data-business-ref="' + id + '"]'), form = $('business-form');
    const names = ['name', 'road', 'postal', 'detail', 'contactName', 'contactPhone', 'storePhone', 'email', 'dropoff'];
    const phones = new Map();
    for (const name of ['contactPhone', 'storePhone']) {
      const input = $('business-' + name); input.setAttribute('aria-label', input.closest('label').firstElementChild.textContent);
      const control = services.mountPhone(input, {required: false}); phones.set(name, control); owned.add(control);
    }
    const email = services.mountEmail($('business-email'), {autoValidate: false}); owned.add(email);
    const query = $('business-road'), postal = $('business-postal'); postal.readOnly = true;
    const tools = document.createElement('div'); tools.className = 'business-tools';
    const results = document.createElement('div'); results.className = 'research-address-results';
    const addressError = document.createElement('p'); addressError.className = 'field-help'; addressError.setAttribute('role', 'status'); addressError.hidden = true;
    query.closest('label').after(tools, results, addressError);
    const address = services.mountAddress({query, road: query, postal, detail: $('business-detail'), dropoff: $('business-dropoff'), results, error: addressError}, {required: false});
    owned.add(address);
    tools.append(button('주소 검색', 'research-business-address-search', () => address.search()), button('주소 지우기', 'research-business-address-clear', () => address.clear()));
    const get = name => phones.has(name) ? phones.get(name).get() : name === 'email' ? email.get() : $('business-' + name).value;
    const fingerprint = ({regions = false} = {}) => JSON.stringify({fields: Object.fromEntries(names.map(name => [name, get(name).trim()])),
      address: address.get(), ...(regions ? {regions: [$('region-root').value, $('region-leaf').value]} : {})});
    let baseline = fingerprint();
    const fieldBridge = {
      get,
      restore(profile) {
        if (!alive()) return;
        for (const name of names) if (!phones.has(name) && name !== 'email') $('business-' + name).value = profile[name] ?? '';
        for (const [name, phone] of phones) phone.set(profile[name] ?? '');
        email.set(profile.email ?? '', {validate: false}); address.set(profile); baseline = fingerprint();
        for (const input of form.querySelectorAll('input')) U?.syncField?.(input);
      },
      reconcileAddress(profile) {
        const selected = address.get(), manualRegion = profile.region;
        Object.assign(profile, selected); profile.region = manualRegion || selected.region;
      },
      dirty: () => fingerprint() !== baseline,
      validating(value) {if (alive()) form.setAttribute('aria-busy', String(value));},
      async validate({deleted, signal: requestSignal}) {
        if (!alive() || requestSignal?.aborted) return {ok: false};
        if (deleted) return {ok: true};
        for (const phone of phones.values()) {
          const result = phone.commit();
          if (!result.ok) {phone.input.focus(); return {ok: false, message: '전화번호를 확인해 주세요.'};}
        }
        const hasAddress = [query.value, postal.value, $('business-detail').value, $('business-dropoff').value].some(value => value.trim());
        if (hasAddress && !address.commit().ok) {query.focus(); return {ok: false, message: '검색 결과에서 사업장 주소를 선택해 주세요.'};}
        const before = fingerprint({regions: true});
        if (email.get()) {
          const result = await email.validate({signal: requestSignal});
          if (!alive() || requestSignal?.aborted) return {ok: false};
          if (!result.valid) {email.input.focus(); return {ok: false, message: email.error() || '이메일을 확인해 주세요.'};}
        }
        const current = () => alive() && !requestSignal?.aborted && before === fingerprint({regions: true}) &&
          [...phones.values()].every(phone => phone.read().valid) && (!hasAddress || address.read().valid) &&
          !email.read().composing && (!email.get() || !!email.proof());
        return current() ? {ok: true} : {ok: false, message: '확인 중 입력이 바뀌었습니다. 현재 내용을 다시 확인해 주세요.'};
      }
    };
    runtime = module.bootResearchBusinessDirectory(() => {}, regions, {root, adapter, signal: controller.signal, ask: confirm, fieldBridge});
    shared = U?.sharedMount?.(root, {mode: 'product', reduced: () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false});
    // Membership data is read from the same adapter; directory saves do not
    // create membership, identity verification or commercial permissions.
    if (push || onNavigate) adapter.roleRequest('/account', null, controller.signal).then(account => {
      if (!alive() || !account.members?.length) return;
      const navigation = document.createElement('div'); navigation.className = 'mf-actions';
      navigation.append(button('구성원과 권한', 'research-business-members', () => {
        if (push) push('manage.business.members', '구성원과 권한'); else onNavigate?.('store-settings', 'members');
      })); root.prepend(navigation);
    }).catch(() => {});
    await runtime.ready;
    if (!alive()) return false;
    if (initialState === 'add') $('business-add').click();
    else if (['detail', 'edit'].includes(initialState)) {
      const selected = typeof businessId === 'string' ? [...$('business-list').querySelectorAll('[data-business-id]')].find(button => button.dataset.businessId === businessId) : null;
      if (selected) selected.click();
      else $('business-status').textContent = businessId ? '선택한 사업장을 찾지 못했어요. 목록에서 다시 선택해 주세요.' : '목록에서 확인하거나 수정할 사업장을 선택해 주세요.';
    }
    return alive();
  })().catch(() => {
    if (alive()) {loading.textContent = '사업장을 불러오지 못했어요. 다시 시도해 주세요.'; root.append(loading);} return false;
  });
  return dispose;
}
