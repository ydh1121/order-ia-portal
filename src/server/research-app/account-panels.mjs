import {mountResearchNotifications} from './notifications.mjs';

export const researchAccountPanelIds = Object.freeze(['profile.personal', 'profile.account', 'profile.connections', 'notifications']);
let panelSequence = 0;

/** A product panel, shared by the research app and its QA frame. The adapter
 * selects real or fixture transport; this module never manufactures success. */
export function mountResearchAccountPanel({id, container, signal, push, adapter, services, onNavigate, setUnread, beforeSwitch} = {}) {
  if (!researchAccountPanelIds.includes(id)) throw TypeError('RESEARCH_ACCOUNT_PANEL_UNSUPPORTED');
  if (!container?.ownerDocument || typeof adapter?.request !== 'function' || !services) throw TypeError('RESEARCH_ACCOUNT_PANEL_CONTEXT');
  if (id === 'notifications') return mountResearchNotifications({container, adapter, signal, setUnread, showPreferences: true,
    onOpenAll: typeof onNavigate === 'function' ? () => onNavigate({screen: 'notifications', state: 'list'}) : undefined});
  const document = container.ownerDocument, window = document.defaultView, U = window.QAUI;
  if (!U?.field || !U?.button) throw Error('COMMON_UI_UNAVAILABLE');
  const controller = new AbortController(), cleanups = [], fields = new Set(), sequence = ++panelSequence;
  let disposed = false, root = null;
  const alive = () => !disposed && !controller.signal.aborted && root?.parentNode === container;
  const node = (tag, value, className) => {
    const element = document.createElement(tag); if (value !== undefined) element.textContent = value;
    if (className) element.className = className; return element;
  };
  const listen = (target, type, callback) => {
    const wrapped = event => {if (alive()) callback(event);};
    target.addEventListener(type, wrapped); cleanups.push(() => target.removeEventListener(type, wrapped));
  };
  function dispose() {
    if (disposed) return; disposed = true; controller.abort(); signal?.removeEventListener('abort', dispose);
    for (const cleanup of cleanups) cleanup(); for (const field of fields) field.dispose(); fields.clear();
    if (root?.parentNode === container) root.remove();
  }
  if (signal?.aborted) {disposed = true; dispose.ready = Promise.resolve(false); return dispose;}
  signal?.addEventListener('abort', dispose, {once: true});
  root = node('section', undefined, 'research-account-panel'); root.dataset.researchAccountPanel = id;
  const status = node('p', '불러오는 중이에요.', 'muted'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  root.append(status); container.replaceChildren(root);
  const message = error => ({ACCOUNT_RESPONSE_INVALID: '저장 결과를 확인하지 못했어요. 입력을 보존했으니 다시 시도해 주세요.',
    NOTIFICATIONS_RESPONSE_INVALID: '알림 목록을 확인하지 못했어요. 다시 시도해 주세요.',
    NOTIFICATION_RESPONSE_INVALID: '읽음 처리 결과를 확인하지 못했어요. 다시 시도해 주세요.'})[error?.message] || adapter.message?.(error) || error?.userMessage || '요청을 처리하지 못했어요. 입력을 보존했으니 다시 시도해 주세요.';
  function field(label, name, value, options = {}) {
    const holder = node('div'); holder.innerHTML = U.field(label, name, '', {value: value ?? '', ...options});
    const input = holder.querySelector('input'), ids = new Map();
    for (const element of holder.querySelectorAll('[id]')) {const previous = element.id; element.id = `research-account-${sequence}-${previous}`; ids.set(previous, element.id);}
    for (const element of holder.querySelectorAll('[for],[aria-labelledby],[aria-describedby],[aria-controls]')) {
      for (const attribute of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) if (element.hasAttribute(attribute))
        element.setAttribute(attribute, element.getAttribute(attribute).split(' ').map(value => ids.get(value) ?? value).join(' '));
    }
    U.syncField?.(input); listen(input, 'input', () => U.syncField?.(input));
    return {element: holder.firstElementChild, input};
  }
  function button(label, action, callback, kind = 'secondary') {
    const holder = node('div'); holder.innerHTML = U.button(U.esc(label), action, kind);
    const element = holder.firstElementChild; if (callback) listen(element, 'click', callback); return element;
  }
  function navigate(panel, title) {
    if (typeof push === 'function') push(panel, title);
    else onNavigate?.('profile', panel.slice('profile.'.length));
  }
  function mountReadonlyEmail(profile) {
    const email = field('이메일', 'email', profile.email, {type: 'email', autocomplete: 'email'});
    email.input.readOnly = true; root.append(email.element);
    const control = services.mountEmail(email.input, {readOnly: true, autoValidate: false}); fields.add(control);
    const note = node('p', '이메일 변경 기능은 아직 연결되지 않았어요.', 'field-help');
    note.id = `research-account-${sequence}-email-note`;
    const describedBy = email.input.getAttribute('aria-describedby');
    email.input.setAttribute('aria-describedby', [describedBy, note.id].filter(Boolean).join(' ')); root.append(note);
    return control;
  }
  async function renderAccount() {
    const current = await adapter.request('/account', null, controller.signal); if (!alive()) return false;
    if (!Number.isSafeInteger(current?.revision) || current.revision < 0 || !current.profile || typeof current.profile !== 'object') throw Error('ACCOUNT_RESPONSE_INVALID');
    root.replaceChildren();
    if (id === 'profile.connections') {
      const connections = Array.isArray(current.profile.connections) ? current.profile.connections : [];
      if (!connections.length) root.append(node('p', '연결된 간편 로그인 계정이 없어요.', 'muted'));
      const labels = {google: 'Google', kakao: '카카오', naver: '네이버', apple: 'Apple', email: '이메일'};
      for (const connection of connections) {
        const provider = typeof connection === 'string' ? connection : connection?.provider ?? connection?.name;
        const title = labels[provider] ?? (typeof provider === 'string' ? provider : '간편 로그인');
        const card = node('article', undefined, 'ops-panel'); card.append(node('strong', title));
        if (typeof connection?.email === 'string') card.append(node('p', connection.email, 'muted'));
        root.append(card);
      }
      root.append(node('p', '계정 연결·해제 기능은 아직 연결되지 않았어요.', 'field-help')); return true;
    }
    mountReadonlyEmail(current.profile);
    if (id === 'profile.account') {
      adapter.mountAccountSwitcher?.(root,current,controller.signal,beforeSwitch);
      const actions = node('div', undefined, 'mf-actions');
      actions.append(button('개인 정보', 'research-open-personal', () => navigate('profile.personal', '개인 정보')),
        button('연결된 계정', 'research-open-connections', () => navigate('profile.connections', '연결된 계정')));
      root.append(actions); return true;
    }
    const form = node('form'), name = field('이름', 'name', current.profile.name, {max: 80, required: true, autocomplete: 'name'});
    const phone = field('전화번호', 'phone', current.profile.phone, {type: 'tel', autocomplete: 'tel'});
    form.noValidate = true; form.append(name.element, phone.element); root.append(form);
    const phoneControl = services.mountPhone(phone.input, {required: false}); fields.add(phoneControl);
    let revision = current.revision, pending = false, retry = null;
    const save = button('저장', 'research-save-profile', persist, 'primary'); status.textContent = ''; form.append(save, status);
    listen(form, 'submit', event => {event.preventDefault(); persist();});
    async function persist() {
      if (!alive() || pending) return;
      const nameError = !name.input.value.trim() ? '이름을 입력해 주세요.' : name.input.value.length > 80 ? '이름은 80자 이내로 입력해 주세요.' : '';
      U.setFieldError(name.input, nameError);
      const phoneResult = await phoneControl.commit(); if (!alive() || pending) return;
      if (nameError || !phoneResult.ok) {if (nameError) name.input.focus(); else phone.input.focus(); return;}
      // The DOM primary input is only one segment. Persist the original
      // adapter's full number, never phone.input.value.
      const submitted = {name: name.input.value, phone: phoneControl.get()}, expectedRevision = revision;
      const signature = JSON.stringify({expectedRevision, profile: submitted});
      if (retry?.signature !== signature) retry = {signature, requestKey: globalThis.crypto.randomUUID()};
      pending = true; save.disabled = true; status.textContent = '저장 중이에요.';
      try {
        const result = await adapter.request('/account', {action: 'update', expectedRevision, requestKey: retry.requestKey, profile: submitted}, controller.signal);
        if (!alive()) return;
        if (result?.revision !== expectedRevision + 1 || result.profile?.name !== submitted.name.trim() || result.profile?.phone !== submitted.phone.trim()) throw Error('ACCOUNT_RESPONSE_INVALID');
        revision = result.revision; retry = null;
        const unchanged = name.input.value === submitted.name && phoneControl.get() === submitted.phone;
        if (unchanged) {name.input.value = result.profile.name; phoneControl.set(result.profile.phone); U.syncField?.(name.input); U.syncField?.(phone.input);}
        status.textContent = unchanged ? '저장했어요.' : '앞선 내용을 저장했어요. 새로 입력한 내용은 아직 저장되지 않았어요.';
      } catch (error) {if (alive()) status.textContent = message(error);}
      finally {pending = false; if (alive()) save.disabled = false;}
    }
    return true;
  }
  dispose.ready = renderAccount().catch(error => {
    if (alive()) {status.textContent = message(error); if (status.parentNode !== root) root.append(status);} return false;
  });
  return dispose;
}
