import {mountNotificationPreferences} from './notification-preferences-ui.mjs';

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const PREVIEW_LIMIT = 3, PAGE_SIZE = 20;
const CATEGORIES = Object.freeze({all: '전체', order: '주문', quote: '견적', delivery: '배송', price: '시세', news: '소식', benefit: '혜택', other: '기타'});

export function notificationCategory(item) {
  const aliases = {purchase: 'order', purchases: 'order', order: 'order', quote: 'quote', quotes: 'quote', delivery: 'delivery', shipment: 'delivery', price: 'price', price_change: 'price', news: 'news', benefit: 'benefit', promotion: 'benefit'};
  const lookup = key => Object.hasOwn(aliases, key) ? aliases[key] : null;
  const declared = lookup(item?.category) || lookup(item?.type) || lookup(item?.kind);
  if (declared) return declared;
  if (item?.route === 'purchases') return ['DISPATCHED', 'RECEIVED'].includes(item.status) ? 'delivery' : 'order';
  return 'other';
}

/** Notification times always describe delivery, independently of read state. */
export function formatNotificationTime(createdAt, now = Date.now(), timeZone = 'Asia/Seoul') {
  const sent = new Date(createdAt), timestamp = sent.getTime();
  if (!Number.isFinite(timestamp)) return {label: '', full: '', iso: ''};
  const elapsed = Math.max(0, Number(now) - timestamp);
  const full = new Intl.DateTimeFormat('ko-KR', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(sent);
  const label = elapsed < MINUTE ? '지금' : elapsed < HOUR ? `${Math.floor(elapsed / MINUTE)}분 전` : elapsed < DAY ? `${Math.floor(elapsed / HOUR)}시간 전` :
    new Intl.DateTimeFormat('en-GB', {timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(sent);
  return {label, full, iso: sent.toISOString()};
}

function notificationItems(response) {
  if (!Array.isArray(response?.items)) throw Error('NOTIFICATIONS_RESPONSE_INVALID');
  const ids = new Set();
  const items = response.items.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || !Number.isSafeInteger(item.revision) || item.revision < 0 ||
      typeof item.title !== 'string' || typeof item.body !== 'string' || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) ||
      item.readAt != null && (typeof item.readAt !== 'string' || !Number.isFinite(Date.parse(item.readAt)))) throw Error('NOTIFICATIONS_RESPONSE_INVALID');
    ids.add(item.id); return {...item};
  });
  // Transport order is not part of the view contract. Preserve ties so a
  // refresh does not shuffle messages delivered at the same instant.
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** The account preview and the full notification page share the same reader.
 * Opening a list never marks anything read; opening one message uses the
 * adapter's revision/idempotency contract before updating unread counts. */
export function mountResearchNotifications({container, adapter, signal, mode = 'preview', onOpenAll, setUnread, now = () => Date.now(), timeZone = 'Asia/Seoul'} = {}) {
  if (!container?.ownerDocument || typeof adapter?.request !== 'function' || !['preview', 'full'].includes(mode)) throw TypeError('RESEARCH_NOTIFICATIONS_CONTEXT');
  const document = container.ownerDocument, window = document.defaultView, controller = new AbortController();
  const operations = new Map(), listeners = [], timestamps = new Map();
  let disposed = false, items = [], selected = null, category = 'all', visible = PAGE_SIZE, loading = false, loadSequence = 0, clock = null;
  const node = (tag, text, className) => {const result = document.createElement(tag); if (text !== undefined) result.textContent = text; if (className) result.className = className; return result;};
  const root = node('section', undefined, 'research-notifications'); root.dataset.notificationsMode = mode;
  const content = node('div', undefined, 'research-notifications-content');
  if (mode === 'full') root.append(node('h1', '알림', 'research-notifications-title'));
  root.append(content); container.replaceChildren(root);
  const preferences = mode === 'full' ? mountNotificationPreferences({container: root, adapter, signal: controller.signal}) : null;
  const alive = () => !disposed && !controller.signal.aborted && root.parentNode === container;
  const listen = (element, type, callback) => {element.addEventListener(type, callback); listeners.push(() => element.removeEventListener(type, callback));};
  const status = node('p', '', 'research-notifications-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const message = error => error?.message === 'NOTIFICATIONS_RESPONSE_INVALID' ? '알림 목록을 확인하지 못했어요. 다시 시도해 주세요.' :
    error?.message === 'NOTIFICATION_RESPONSE_INVALID' ? '알림 확인 결과를 저장하지 못했어요. 다시 시도해 주세요.' :
      adapter.message?.(error) || error?.userMessage || '알림을 불러오지 못했어요. 다시 시도해 주세요.';
  const unread = () => items.filter(item => !item.readAt).length;
  function announce() {
    if (!alive()) return; const count = unread(); setUnread?.(count);
    root.dispatchEvent(new window.CustomEvent('research-notifications-state', {bubbles: true, detail: {unread: count}}));
  }
  function button(label, action, className, callback) {
    const result = node('button', label, className); result.type = 'button'; result.dataset.action = action;
    if (callback) listen(result, 'click', callback); return result;
  }
  function appendPreviewLink() {
    if (mode === 'preview' && typeof onOpenAll === 'function') content.append(button(items.length > PREVIEW_LIMIT ? '더 보기' : '알림 전체 보기', 'research-all-notifications', 'research-notifications-more', () => {if (alive()) onOpenAll();}));
  }
  function timestamp(item) {
    const result = node('time', '', 'research-notification-time'); result.dataset.notificationTime = item.id;
    timestamps.set(result, item.createdAt); updateTime(result, item.createdAt); return result;
  }
  function updateTime(element, createdAt) {
    const value = formatNotificationTime(createdAt, now(), timeZone);
    element.textContent = value.label; element.dateTime = value.iso;
    element.title = `발송 ${value.full}`; element.setAttribute('aria-label', `발송 ${value.full}`);
  }
  function updateTimes() {for (const [element, createdAt] of timestamps) if (root.contains(element)) updateTime(element, createdAt); else timestamps.delete(element);}
  function clearView() {
    for (const cleanup of listeners.splice(0)) cleanup(); timestamps.clear(); content.replaceChildren(); status.textContent = '';
  }
  function titleRow(item, tag = 'strong') {
    const header = node('span', undefined, 'research-notification-heading');
    header.append(node(tag, item.title, 'research-notification-title'), timestamp(item)); return header;
  }
  function open(item) {
    if (!alive()) return; selected = item.id; renderDetail(item); void markRead(item);
  }
  function renderList(focusId) {
    if (!alive()) return; selected = null; clearView();
    if (mode === 'full') {
      const label = node('label', undefined, 'research-notification-filter'), select = node('select');
      select.setAttribute('aria-label', '알림 종류'); select.dataset.notificationFilter = '';
      for (const [value, name] of Object.entries(CATEGORIES)) {const option = node('option', name); option.value = value; select.append(option);}
      select.value = category; label.append(node('span', '종류'), select); content.append(label);
      listen(select, 'change', () => {category = select.value; visible = PAGE_SIZE; renderList(); content.querySelector('[data-notification-filter]')?.focus();});
    }
    const filtered = category === 'all' ? items : items.filter(item => notificationCategory(item) === category);
    if (!filtered.length) {content.append(node('p', category === 'all' ? '새 알림이 없어요.' : `${CATEGORIES[category]} 알림이 없어요.`, 'research-notifications-empty')); appendPreviewLink(); return;}
    const list = node('ul', undefined, 'research-notification-list');
    for (const item of filtered.slice(0, mode === 'preview' ? PREVIEW_LIMIT : visible)) {
      const row = node('li');
      const control = button(undefined, 'research-open-notification', 'research-notification-item', () => open(item));
      control.dataset.notificationId = item.id; control.dataset.read = String(!!item.readAt);
      control.append(titleRow(item), node('span', item.body, 'research-notification-summary')); row.append(control); list.append(row);
    }
    content.append(list);
    appendPreviewLink();
    if (mode === 'full' && visible < filtered.length) content.append(button('더 보기', 'research-more-notifications', 'research-notifications-more', () => {
      const firstNew = filtered[visible]?.id; visible += PAGE_SIZE; renderList(firstNew);
    }));
    if (focusId) [...list.querySelectorAll('[data-notification-id]')].find(element => element.dataset.notificationId === focusId)?.focus();
  }
  function renderDetail(item) {
    if (!alive()) return; clearView();
    const toolbar = node('div', undefined, 'research-notification-toolbar');
    const back = button(undefined, 'research-notification-back', 'research-notification-back t-learn', () => renderList(item.id));
    back.setAttribute('aria-label', '알림 목록으로 돌아가기');
    back.innerHTML = '<span class="research-notification-back-direction" aria-hidden="true"><span class="t-learn-chevron"><svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path class="t-learn-arm t-learn-arm-top" d="M6 4L10 8"/><path class="t-learn-arm t-learn-arm-bot" d="M10 8L6 12"/></svg></span></span>';
    toolbar.append(back, node('span', '알림', 'research-notification-detail-label')); content.append(toolbar);
    const detail = node('article', undefined, 'research-notification-detail'); detail.dataset.notificationDetail = item.id; detail.tabIndex = -1;
    detail.append(titleRow(item, 'h2'), node('p', item.body, 'research-notification-body')); content.append(detail, status);
    const operation = operations.get(item.id); if (operation?.pending) detail.setAttribute('aria-busy', 'true');
    detail.focus();
  }
  async function markRead(item) {
    if (!alive() || item.readAt) return;
    let operation = operations.get(item.id);
    if (operation?.pending) return;
    if (!operation) {operation = {requestKey: window.crypto.randomUUID(), pending: false}; operations.set(item.id, operation);}
    operation.pending = true;
    const expectedRevision = item.revision;
    const detail = content.querySelector('[data-notification-detail]'); detail?.setAttribute('aria-busy', 'true');
    try {
      const result = await adapter.request('/notifications', {id: item.id, action: 'read', expectedRevision, requestKey: operation.requestKey}, controller.signal);
      if (!alive()) return;
      if (result?.id !== item.id || result.revision !== expectedRevision + 1 || typeof result.readAt !== 'string' || !Number.isFinite(Date.parse(result.readAt))) throw Error('NOTIFICATION_RESPONSE_INVALID');
      item.revision = result.revision; item.readAt = result.readAt; operations.delete(item.id); announce();
      for (const control of content.querySelectorAll('[data-notification-id]')) if (control.dataset.notificationId === item.id) control.dataset.read = 'true';
      if (selected === item.id) status.textContent = '';
    } catch (error) {
      if (alive() && selected === item.id) {
        status.textContent = message(error);
        const retry = button('다시 시도', 'research-retry-notification', 'research-notifications-retry', () => {retry.remove(); status.textContent = ''; void markRead(item);});
        status.after(retry);
      }
    } finally {
      operation.pending = false; if (alive() && selected === item.id) content.querySelector('[data-notification-detail]')?.removeAttribute('aria-busy');
    }
  }
  async function load() {
    if (!alive() || loading) return false; loading = true; const sequence = ++loadSequence;
    clearView(); status.textContent = '알림을 불러오는 중이에요.'; content.append(status);
    try {
      const response = await adapter.request('/notifications', null, controller.signal);
      if (!alive() || sequence !== loadSequence) return false;
      items = notificationItems(response); announce(); renderList(); return true;
    } catch (error) {
      if (alive() && sequence === loadSequence) {
        status.textContent = message(error); content.append(button('다시 시도', 'research-retry-notifications', 'research-notifications-retry', () => {void load();}));
      }
      return false;
    } finally {if (sequence === loadSequence) loading = false;}
  }
  function dispose() {
    if (disposed) return; disposed = true; controller.abort(); signal?.removeEventListener('abort', dispose);
    preferences?.();
    if (clock !== null) window.clearInterval(clock); for (const cleanup of listeners.splice(0)) cleanup(); timestamps.clear();
    if (root.parentNode === container) root.remove();
  }
  if (signal?.aborted) {dispose(); dispose.ready = Promise.resolve(false); return dispose;}
  signal?.addEventListener('abort', dispose, {once: true});
  clock = window.setInterval(() => {if (alive()) updateTimes();}, MINUTE);
  dispose.ready = load(); return dispose;
}
