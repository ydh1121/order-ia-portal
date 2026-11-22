/** Research product services. QA may inject transports; it does not own rules.
 * Every validation verdict comes from the regular product's sealed modules. */
export const REGULAR_ASSET_PREFIX = '/ia/research-assets/';
let nextFieldId = 0;
const deniedAddress = () => Promise.resolve(new Response(JSON.stringify({
  version: 1, status: 'UNAVAILABLE', reason: 'NOT_CONFIGURED', items: []
}), {status: 503, headers: {'content-type': 'application/json'}}));
const noGrants = Object.freeze({ownershipVerified: false, mailboxVerified: false, orderApproved: false});

export async function createRegularServices(environment = {}) {
  const document = environment.document ?? globalThis.document;
  if (!document) throw TypeError('REGULAR_SERVICES_DOCUMENT_REQUIRED');
  const origin = environment.origin ?? document.defaultView?.location.origin ?? globalThis.location?.origin;
  const load = environment.loadModule ?? (path => import(REGULAR_ASSET_PREFIX + path));
  const [contactModule, address, addressSearch, addressUI, emailCore, phoneCore] = await Promise.all([
    load('bridge/contact-ui.mjs'),
    load('web/address-contract.mjs'), load('web/address-service.mjs'), load('web/address-ui.mjs'),
    load('src/engine/validation/email.mjs'), load('src/engine/validation/phone.mjs')
  ]);
  const contact = contactModule.createRegularContactAdapters({...environment, document, origin});
  // Merely mounting a form must not invent a working address provider. A
  // product/lab adapter explicitly supplies this transport and its credentials.
  const addressConnected = typeof environment.address?.fetcher === 'function' && environment.address.configured !== false;
  const searchService = addressSearch.createAddressSearchService({...environment.address,
    origin, now: environment.now ?? Date.now, fetcher: addressConnected ? environment.address.fetcher : deniedAddress});
  const fields = new Set(), releases = new Set(), globalOwners = new WeakMap(), emailOwners = new WeakMap(), phoneOwners = new WeakMap(), addressOwners = new WeakMap(), formOwners = new WeakMap();
  let closed = false;
  const assertOpen = () => { if (closed) throw Error('REGULAR_SERVICES_CLOSED'); };
  const emit = (input, kind, state, callback) => {
    callback?.(state);
    const Event = document.defaultView?.CustomEvent ?? globalThis.CustomEvent;
    input.dispatchEvent(new Event('research-field-state', {bubbles: true, detail: {kind, ...state}}));
  };
  function rememberInput(input) {
    const attributes = [...input.attributes].map(attribute => [attribute.name, attribute.value]);
    if (!input.id) input.id = 'research-field-' + (++nextFieldId);
    return () => {
      for (const attribute of [...input.attributes]) input.removeAttribute(attribute.name);
      for (const [name, value] of attributes) input.setAttribute(name, value);
    };
  }
  function feedback(input, options = {}, mark = flag => input.setAttribute('aria-invalid', String(flag))) {
    const supplied = options.errorElement, target = supplied ?? document.createElement('span');
    if (!target.id) target.id = input.id + '-regular-error';
    const original = {text: target.textContent, hidden: target.hidden,
      describedBy: input.getAttribute('aria-describedby'), invalid: input.getAttribute('aria-invalid')};
    if (!supplied) {target.className = 'research-field-error'; target.hidden = true; target.setAttribute('role', 'status'); input.parentNode?.append(target);}
    let message = '';
    return {
      get: () => message,
      set(value = '') {
        message = String(value); target.textContent = message; target.hidden = !message; mark(!!message);
        const ids = new Set((original.describedBy ?? '').split(' ').filter(Boolean));
        if (message) ids.add(target.id);
        if (ids.size) input.setAttribute('aria-describedby', [...ids].join(' ')); else input.removeAttribute('aria-describedby');
        options.onError?.(message); return message;
      },
      dispose() {
        if (supplied) {target.textContent = original.text; target.hidden = original.hidden;} else target.remove();
        for (const [name, value] of [['aria-describedby', original.describedBy], ['aria-invalid', original.invalid]])
          if (value === null) input.removeAttribute(name); else input.setAttribute(name, value);
      }
    };
  }

  function mountEmail(input, options = {}) {
    assertOpen(); if (emailOwners.has(input)) return emailOwners.get(input);
    const restoreAttributes = rememberInput(input), control = contact.mountEmail(input), shell = input.parentNode;
    const readOnly = options.readOnly ?? input.readOnly;
    if (readOnly) {input.readOnly = true; contact.suspendEmail(input); input.setAttribute('aria-busy', 'false');}
    const error = feedback(input, options); let disposed = false, composing = false;
    const read = () => {
      const parsed = contact.email.parse(input.value), proof = disposed ? null : control.proof();
      return {kind: 'email', value: input.value, valid: !disposed && !composing && parsed.valid && contact.domain.isSuccess(proof),
        status: disposed ? 'UNAVAILABLE' : proof?.state ?? contact.domain.status(input.value).state,
        contract: parsed.contract, proof, composing, readOnly, pending: !disposed && control.pending, ...noGrants};
    };
    const changed = () => { if (!disposed) {error.set(''); emit(input, 'email', read(), options.onChange);} };
    const compositionStart = () => {composing = true; changed();}, compositionEnd = () => {composing = false; changed();};
    input.addEventListener('order-email-state', changed);
    input.addEventListener('compositionstart', compositionStart); input.addEventListener('compositionend', compositionEnd);
    const api = {
      kind: 'email', input, get: () => input.value, read, proof: () => disposed ? null : control.proof(),
      snapshot: () => ({kind: 'email', value: input.value, selection: {start: input.selectionStart,
        end: input.selectionEnd, direction: input.selectionDirection}}),
      set(value, {validate = options.autoValidate !== false} = {}) {
        if (disposed) return false; composing = false; control.reset(value?.value ?? value ?? '');
        if (readOnly) control.cancel(); else if (!validate) control.cancelPending(); error.set(''); return read();
      },
      restore(snapshot) {
        const state = api.set(snapshot?.value ?? snapshot, {validate: false});
        if (!disposed && snapshot?.selection) input.setSelectionRange(snapshot.selection.start, snapshot.selection.end, snapshot.selection.direction ?? 'none');
        return state;
      },
      async validate({expose = true, signal, force = false} = {}) {
        if (disposed || signal?.aborted) return {...read(), valid: false, discarded: true};
        if (readOnly) return {...read(), valid: false, reason: 'READ_ONLY_FIELD'};
        if (composing) return {...read(), valid: false, reason: 'INPUT_COMPOSING'};
        const cancel = () => control.cancelPending(); signal?.addEventListener('abort', cancel, {once: true});
        let result;
        try {result = await control.check(force);} finally {signal?.removeEventListener('abort', cancel);}
        const state = {...read(), discarded: !!result?.discarded || !!signal?.aborted || disposed};
        if (state.discarded) state.valid = false;
        if (expose && !disposed && !state.discarded) error.set(state.valid ? '' :
          !contact.email.parse(input.value).valid || contact.domain.isHard(result) ? '이메일 주소를 확인해 주세요.' : '이메일 도메인을 현재 확인할 수 없습니다. 다시 시도해 주세요.');
        return state;
      },
      async commit(options) {const result = await api.validate(options); return {ok: result.valid, value: result.value, proof: result.proof, result, ...noGrants};},
      error(message) {if (arguments.length && !disposed) return error.set(message); return error.get();},
      cancel() {if (!disposed) control.cancelPending();},
      dispose() {
        if (disposed) return; disposed = true; input.removeEventListener('order-email-state', changed);
        input.removeEventListener('compositionstart', compositionStart); input.removeEventListener('compositionend', compositionEnd);
        contact.disposeEmail(input); error.dispose(); if (shell?.contains(input)) shell.replaceWith(input);
        restoreAttributes(); emailOwners.delete(input); fields.delete(api);
      }
    };
    emailOwners.set(input, api); fields.add(api); return api;
  }

  function mountPhone(input, options = {}) {
    assertOpen(); if (phoneOwners.has(input)) return phoneOwners.get(input);
    const existingShell = input.closest('.ui-phone-shell');
    const primary = existingShell?.querySelector('input');
    if (primary && primary !== input) return mountPhone(primary, options);
    const restoreAttributes = rememberInput(input);
    // This is the unmodified segmented/caret/IME adapter, not a second formatter.
    const control = contact.phone.mount(input);
    const error = feedback(input, options, flag => control.setInvalid(flag)); let disposed = false;
    const required = options.required ?? (input.required || input.getAttribute('aria-required') === 'true');
    const read = () => {
      const projection = control.projection({required}), composing = control.snapshot().composing;
      return {kind: 'phone', value: control.get(), valid: !disposed && !composing && projection.saveAllowed,
        status: disposed ? 'UNAVAILABLE' : projection.contract.status, contract: projection.contract,
        projection, composing, pending: false, proof: null, ...noGrants};
    };
    const changed = () => {if (!disposed) {error.set(''); emit(input, 'phone', read(), options.onChange);} };
    control.shell.addEventListener('order-phone-input', changed);
    const api = {
      kind: 'phone', input, get: control.get, read, proof: () => null,
      snapshot: () => ({kind: 'phone', value: control.get(), editor: control.snapshot()}),
      set(value) {if (disposed) return false; control.set(value?.value ?? value ?? ''); error.set(''); return read();},
      restore(snapshot) {
        const state = api.set(snapshot?.value ?? snapshot), mark = snapshot?.editor?.selection;
        if (!disposed && mark) {const part = control.parts[mark.index]; if (part && !part.hidden) part.setSelectionRange(mark.start, mark.end, mark.direction ?? 'none');}
        return state;
      },
      validate({expose = true} = {}) {
        if (!disposed) control.commit(); const result = read();
        if (expose && !disposed) error.set(result.valid ? '' : '전화번호를 확인해 주세요.'); return result;
      },
      commit(options) {const result = api.validate(options); return {ok: result.valid, value: result.value, result, ...noGrants};},
      error(message) {if (arguments.length && !disposed) return error.set(message); return error.get();},
      cancel() {},
      dispose() {
        if (disposed) return; const value = control.get(); disposed = true;
        control.shell.removeEventListener('order-phone-input', changed); error.dispose();
        if (control.shell.contains(input)) control.shell.replaceWith(input);
        input.value = value; restoreAttributes(); contact.forgetPhone(input); phoneOwners.delete(input); fields.delete(api);
      }
    };
    phoneOwners.set(input, api); fields.add(api); return api;
  }

  function mountAddress(elements, options = {}) {
    assertOpen(); const query = elements.query ?? elements.road;
    if (!query) throw TypeError('REGULAR_ADDRESS_QUERY_REQUIRED');
    if (addressOwners.has(query)) return addressOwners.get(query);
    const restoreAttributes = rememberInput(query), error = feedback(query, {errorElement: elements.error, ...options});
    const list = elements.results ?? document.createElement('div'), ownList = !elements.results;
    if (!list.id) list.id = query.id + '-regular-results';
    list.setAttribute('role', 'listbox'); list.hidden = true; if (ownList) query.parentNode?.append(list);
    query.setAttribute('role', 'combobox'); query.setAttribute('aria-autocomplete', 'list');
    query.setAttribute('aria-controls', list.id); query.setAttribute('aria-expanded', 'false');
    let draft = address.addressFields(options.value ?? Object.fromEntries(address.ADDRESS_FIELDS.map(key => [key, elements[key]?.value ?? ''])));
    let selectedQuery = query.value || draft.road, currentOptions = [], requestQuery = '', page = 1, hasMore = false;
    let generation = 0, controller = null, timer = null, disposed = false, composing = false, cleared = false, active = -1;
    let status = 'IDLE', transportReason = addressConnected ? null : 'NOT_CONFIGURED';
    const listeners = [];
    const listen = (node, type, callback) => {if (node) {node.addEventListener(type, callback); listeners.push(() => node.removeEventListener(type, callback));}};
    const fieldsValue = () => address.addressFields({...draft,
      detail: elements.detail?.value ?? draft.detail, dropoff: elements.dropoff?.value ?? draft.dropoff});
    const read = () => {
      const value = fieldsValue(), changedQuery = query.value !== selectedQuery;
      const verdict = address.addressStatus(changedQuery ? {...value, providerId: ''} : value);
      return {kind: 'address', value, valid: !disposed && !composing && (verdict.valid || options.required === false && cleared),
        status: disposed ? 'CLOSED' : status, addressStatus: verdict, query: query.value,
        selected: verdict.valid, pending: status === 'LOADING' || status === 'RESOLVING',
        providerConnected: addressConnected, transportReason, page, hasMore, proof: null, ...noGrants};
    };
    const publish = () => {if (!disposed) emit(query, 'address', read(), options.onChange);};
    function setList(open) {
      list.hidden = !open; query.setAttribute('aria-expanded', String(!!open));
      if (!open) {active = -1; query.removeAttribute('aria-activedescendant');}
    }
    function cancel() {
      if (disposed) return;
      clearTimeout(timer); timer = null; generation++; controller?.abort(); controller = null;
      if (status === 'LOADING' || status === 'RESOLVING') status = 'EDITING';
      query.setAttribute('aria-busy', 'false');
    }
    function paintFields({setQuery = true} = {}) {
      for (const key of address.ADDRESS_FIELDS) if (elements[key] && elements[key] !== query) elements[key].value = draft[key];
      if (setQuery) query.value = draft.road; selectedQuery = query.value;
    }
    function renderOptions() {
      list.replaceChildren(); active = -1;
      for (const [index, candidate] of currentOptions.entries()) {
        const button = document.createElement('button'); button.type = 'button'; button.tabIndex = -1;
        button.id = list.id + '-' + index; button.dataset.regularAddressOption = String(index);
        button.setAttribute('role', 'option'); button.setAttribute('aria-selected', 'false');
        button.textContent = address.isPlaceCandidate(candidate) ? candidate.name + ' · ' + (candidate.road || candidate.jibun) : candidate.road + ' · ' + candidate.postal;
        list.append(button);
      }
      setList(currentOptions.length > 0);
    }
    async function search({next = false, signal} = {}) {
      if (disposed || composing || signal?.aborted) return {status: 'ABORTED', reason: 'CANCELLED', items: []};
      cancel(); const epoch = generation, raw = query.value, requestedPage = next && requestQuery === raw ? page + 1 : 1;
      controller = new AbortController(); const request = controller, abort = () => epoch === generation ? cancel() : request.abort();
      signal?.addEventListener('abort', abort, {once: true}); status = 'LOADING'; query.setAttribute('aria-busy', 'true'); publish();
      let result;
      try {result = await searchService.search(raw, {page: requestedPage, signal: request.signal});}
      finally {signal?.removeEventListener('abort', abort);}
      if (disposed || request.signal.aborted || epoch !== generation || raw !== query.value) return {...result, discarded: true};
      controller = null; query.setAttribute('aria-busy', 'false'); transportReason = result.reason;
      if (result.status === 'OK' || result.status === 'EMPTY') {
        const combined = requestedPage > 1 ? [...currentOptions, ...result.items] : result.items;
        currentOptions = [...new Map(combined.map(item => [address.addressCandidateKey(item), item])).values()];
        requestQuery = raw; page = requestedPage; hasMore = result.hasMore; status = currentOptions.length ? 'RESULTS' : 'EMPTY';
        renderOptions(); error.set('');
      } else {
        currentOptions = []; hasMore = false; status = result.status; setList(false);
        error.set(result.reason === 'NOT_CONFIGURED' ? '주소 검색 서비스가 아직 연결되지 않았습니다.' : result.status === 'INVALID_REQUEST' ? '검색어를 확인해 주세요.' : '주소를 검색할 수 없습니다. 다시 시도해 주세요.');
      }
      publish(); return result;
    }
    async function choose(index, {signal} = {}) {
      if (disposed || composing || !currentOptions[index] || signal?.aborted) return false;
      let candidate = currentOptions[index]; cancel(); const epoch = generation, raw = query.value;
      if (address.isPlaceCandidate(candidate)) {
        controller = new AbortController(); const request = controller, abort = () => epoch === generation ? cancel() : request.abort();
        signal?.addEventListener('abort', abort, {once: true}); status = 'RESOLVING'; query.setAttribute('aria-busy', 'true'); publish();
        let resolved;
        try {resolved = await searchService.resolve(requestQuery, candidate, {signal: request.signal});}
        finally {signal?.removeEventListener('abort', abort);}
        if (disposed || request.signal.aborted || epoch !== generation || raw !== query.value) return false;
        controller = null; query.setAttribute('aria-busy', 'false'); transportReason = resolved.reason;
        if (resolved.status !== 'OK') {status = resolved.status; error.set('선택한 장소의 우편주소를 확인할 수 없습니다.'); publish(); return false;}
        candidate = resolved.item;
      }
      try {draft = address.selectAddress(fieldsValue(), candidate);} catch {return false;}
      cleared = false; status = 'SELECTED'; paintFields(); setList(false); hasMore = false; error.set(''); publish(); return true;
    }
    function edited() {
      if (disposed) return; cancel(); currentOptions = []; hasMore = false; cleared = false; status = 'EDITING';
      setList(false); error.set(''); publish();
      if (!composing && options.autoSearch !== false) timer = setTimeout(() => {timer = null; search();}, options.debounceMs ?? 300);
    }
    listen(query, 'input', edited);
    listen(query, 'compositionstart', () => {composing = true; cancel(); setList(false);});
    listen(query, 'compositionend', () => {composing = false; edited();});
    listen(query, 'keydown', event => {
      if (composing || event.isComposing || event.keyCode === 229) return;
      if (['ArrowDown', 'ArrowUp'].includes(event.key) && currentOptions.length) {
        event.preventDefault(); active = (active + (event.key === 'ArrowDown' ? 1 : -1) + currentOptions.length) % currentOptions.length;
        setList(true); [...list.children].forEach((item, index) => item.setAttribute('aria-selected', String(index === active)));
        query.setAttribute('aria-activedescendant', list.children[active].id);
      } else if (event.key === 'Enter') {event.preventDefault(); !list.hidden && currentOptions.length ? choose(active < 0 ? 0 : active) : search();}
      else if (event.key === 'Escape' && !list.hidden) {event.preventDefault(); event.stopPropagation(); cancel(); setList(false);}
    });
    listen(list, 'pointerdown', event => {if (event.target.closest('[data-regular-address-option]')) event.preventDefault();});
    listen(list, 'click', event => {const button = event.target.closest('[data-regular-address-option]'); if (button) choose(Number(button.dataset.regularAddressOption));});
    for (const key of ['detail', 'dropoff']) listen(elements[key], 'input', publish);
    const api = {
      kind: 'address', input: query, read, get: fieldsValue, proof: () => null, search, choose,
      options: () => currentOptions.map(item => ({...item})),
      snapshot: () => ({kind: 'address', value: fieldsValue(), query: query.value}),
      set(value) {
        if (disposed) return false; cancel(); draft = address.addressFields(value?.value ?? value); cleared = false;
        currentOptions = []; hasMore = false; status = 'IDLE'; paintFields(); setList(false); error.set(''); publish(); return read();
      },
      restore(snapshot) {
        const result = api.set(snapshot?.value ?? snapshot);
        if (!disposed && typeof snapshot?.query === 'string') query.value = snapshot.query;
        return result && read();
      },
      clear() {if (disposed) return false; api.set({}); cleared = true; status = 'CLEARED'; publish(); return read();},
      validate({expose = true} = {}) {
        const state = read();
        if (expose && !disposed) error.set(state.valid ? '' : state.addressStatus.issue?.message ?? '검색 결과에서 주소를 선택해 주세요.');
        return state;
      },
      commit(options) {const result = api.validate(options); return {ok: result.valid, value: result.value, result, ...noGrants};},
      error(message) {if (arguments.length && !disposed) return error.set(message); return error.get();}, cancel,
      dispose() {
        if (disposed) return; cancel(); disposed = true; for (const cleanup of listeners) cleanup();
        error.dispose(); if (ownList) list.remove(); else {list.replaceChildren(); list.hidden = true;}
        restoreAttributes(); addressOwners.delete(query); fields.delete(api);
      }
    };
    if (options.value || draft.road) paintFields(); addressOwners.set(query, api); fields.add(api); return api;
  }

  function mountForm(root, options = {}) {
    assertOpen(); if (formOwners.has(root)) return formOwners.get(root);
    const controls = new Map(), own = new Set();
    const register = (key, control) => {controls.set(key, control); own.add(control);};
    for (const input of root.querySelectorAll(options.emailSelector ?? 'input[type="email"],input[autocomplete="email"],input[data-regular-email]'))
      register(input.name || input.id || 'email', mountEmail(input, options.email));
    for (const input of root.querySelectorAll(options.phoneSelector ?? 'input[type="tel"],input[data-regular-phone]')) {
      const shell = input.closest('.ui-phone-shell');
      if (shell && shell.dataset.phoneFor !== input.id) continue;
      register(input.name || input.id || 'phone', mountPhone(input, options.phone));
    }
    if (options.address) register(options.addressName ?? 'address', mountAddress(options.address, options.addressOptions));
    const api = Object.freeze({controls,
      read: () => Object.fromEntries([...controls].map(([name, control]) => [name, control.read()])),
      get: () => Object.fromEntries([...controls].map(([name, control]) => [name, control.get()])),
      snapshot: () => Object.fromEntries([...controls].map(([name, control]) => [name, control.snapshot()])),
      restore(values = {}) {for (const [name, control] of controls) if (Object.hasOwn(values, name)) control.restore(values[name]);},
      async validate(settings) {const results = Object.fromEntries(await Promise.all([...controls].map(async ([name, control]) => [name, await control.validate(settings)]))); return {valid: Object.values(results).every(result => result.valid), results};},
      async commit(settings) {const results = Object.fromEntries(await Promise.all([...controls].map(async ([name, control]) => [name, await control.commit(settings)]))); return {ok: Object.values(results).every(result => result.ok), values: Object.fromEntries(Object.entries(results).map(([key, result]) => [key, result.value])), results, ...noGrants};},
      cancel() {for (const control of own) control.cancel();},
      dispose() {for (const control of own) control.dispose(); own.clear(); formOwners.delete(root);}
    });
    formOwners.set(root, api); return api;
  }
  function installRegularGlobals(target = document.defaultView ?? globalThis) {
    assertOpen();
    if (globalOwners.has(target)) {
      const owner = globalOwners.get(target);
      for (const [key, value] of Object.entries(owner.values)) target[key] = value;
      return owner.release;
    }
    const next = {OrderPhone: contact.phone, OrderEmail: contact.email, OrderEmailDomain: contact.domain,
      OrderEmailUI: Object.freeze({mount: input => contact.mountEmail(input), instance: input => contact.emailInstance(input)})};
    const previous = Object.fromEntries(Object.keys(next).map(key => [key, {own: Object.hasOwn(target, key), value: target[key]}]));
    for (const [key, value] of Object.entries(next)) target[key] = value;
    let released = false;
    const release = () => {if (released) return; released = true; for (const [key, value] of Object.entries(next)) if (target[key] === value) {
      if (previous[key].own) target[key] = previous[key].value; else delete target[key];
    } releases.delete(release); globalOwners.delete(target);};
    releases.add(release); globalOwners.set(target, {release, values: next}); return release;
  }
  const hasRegularGlobals = (target = document.defaultView ?? globalThis) => {
    const owner = globalOwners.get(target);
    return !closed && !!owner && Object.entries(owner.values).every(([key, value]) => target[key] === value);
  };
  function releaseWithin(root) {
    let released = 0;
    for (const field of [...fields]) if (root === field.input || root.contains(field.input)) {field.dispose(); released++;}
    return released + contact.releaseWithin(root);
  }
  return Object.freeze({mountEmail, mountPhone, mountAddress, mountForm, installRegularGlobals, hasRegularGlobals, releaseWithin, addressService: searchService,
    core: Object.freeze({email: emailCore, phone: phoneCore, address}),
    createAddressEditor: options => addressUI.createAddressEditor({...options, service: searchService}),
    provenance: contactModule.REGULAR_SOURCE_PROVENANCE,
    providers: Object.freeze({emailDomain: 'REGULAR_DNS_IANA', address: addressConnected ? 'INJECTED_TRANSPORT' : 'NOT_CONFIGURED', authentication: 'NOT_CONNECTED'}),
    inspect: () => ({closed, mountedFields: fields.size, contact: contact.inspect(), address: searchService.inspect(), providers: {address: addressConnected}}),
    dispose() {if (closed) return; closed = true; for (const field of [...fields]) field.dispose(); searchService.close(); contact.dispose(); for (const release of [...releases]) release();}
  });
}
