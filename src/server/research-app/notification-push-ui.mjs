/** One browser-device control for the product and research notification panel.
 * Research/lab contexts never touch permission, subscription or device storage. */
export function mountNotificationPush({container, adapter, signal} = {}) {
  if (!container?.ownerDocument || typeof adapter?.request !== 'function') throw TypeError('NOTIFICATION_PUSH_CONTEXT');
  const document = container.ownerDocument, window = document.defaultView, controller = new AbortController();
  const root = document.createElement('section'); root.className = 'research-notification-push'; root.dataset.notificationPush = '';
  const title = document.createElement('h3'); title.textContent = '이 기기 알림';
  const note = document.createElement('p'); note.className = 'research-notification-preferences-note';
  const status = document.createElement('p'); status.className = 'research-notifications-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'research-notifications-more'; toggle.dataset.notificationPushToggle = '';
  const reload = document.createElement('button'); reload.type = 'button'; reload.className = 'research-notifications-retry'; reload.textContent = '다시 확인'; reload.hidden = true;
  root.append(title, note, toggle, status, reload); container.append(root);
  let disposed = false, pending = false, configuration = null, subscription = null, currentId = null, retry = null, resetBinding = false;
  const product = adapter.context?.mode === 'product' && adapter.context?.actor?.authenticated !== false;
  const supported = product && window.isSecureContext === true && 'Notification' in window && 'PushManager' in window && Boolean(window.navigator.serviceWorker);
  const cacheKey = 'order.notification-device.' + (adapter.context?.actor?.id || '');
  const alive = () => !disposed && !controller.signal.aborted && root.parentNode === container;
  const digest = async text => Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256', new window.TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
  const decode = value => Uint8Array.from(window.atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  const ownRegistration = () => configuration?.registrations.find(item => item.id === currentId) || null;
  const remember = value => {currentId = value; if (!product) return; try {if (value) window.localStorage.setItem(cacheKey, value); else window.localStorage.removeItem(cacheKey);} catch {}};
  const busy = value => {pending = value; root.setAttribute('aria-busy', String(value)); render();};
  function render() {
    const saved = ownRegistration(), bound = saved?.active === true, active = bound && saved.keyCurrent !== false && (!saved.expiresAt || saved.expiresAt > Date.now());
    root.dataset.pushState = !product ? 'review' : active ? 'registered' : window.Notification?.permission === 'denied' ? 'denied' : configuration?.available ? 'off' : 'unavailable';
    toggle.textContent = resetBinding ? '이 기기 연결 다시 설정' : bound ? active ? '이 기기 알림 끄기' : '이 기기 연결 해제' : retry?.action === 'unsubscribe' ? '연결 해제 다시 시도' : '이 기기 알림 켜기';
    toggle.disabled = pending || !product || (!bound && retry?.action !== 'unsubscribe' && (!supported || !configuration?.available || window.Notification?.permission === 'denied'));
    toggle.setAttribute('aria-pressed', String(active)); reload.disabled = pending;
    note.textContent = !product ? '검토 화면에서는 실제 기기 알림을 등록하지 않아요.' : !supported ? '이 브라우저에서는 기기 알림을 지원하지 않아요. 오더 안에서 알림을 확인할 수 있어요.' :
      window.Notification.permission === 'denied' ? '브라우저 설정에서 오더의 알림을 허용해 주세요. 저장된 연결은 여기에서 해제할 수 있어요.' :
      !configuration?.available ? '기기 알림 연결을 준비 중이에요. 오더 안의 알림과 수신 설정은 계속 사용할 수 있어요.' :
      bound && !active ? '이 기기의 알림 연결을 다시 설정해야 해요. 연결을 해제한 뒤 다시 켜주세요.' :
      active ? '이 기기에서 알림을 받아요. 시세·소식·혜택은 위에서 동의한 항목만 보내요.' : '켜기를 누르면 브라우저가 알림 허용 여부를 물어요. 시세·소식·혜택은 위에서 동의한 항목만 보내요.';
  }
  function validConfiguration(value) {
    return typeof value?.available === 'boolean' && (value.publicKey === null || typeof value.publicKey === 'string' && /^[A-Za-z0-9_-]{87}$/.test(value.publicKey)) &&
      value.serviceWorker === '/order-notifications-sw.js' && Array.isArray(value.registrations) && value.registrations.every(r =>
        /^[a-f0-9]{64}$/.test(r.id) && Number.isSafeInteger(r.revision) && r.revision > 0 && typeof r.active === 'boolean');
  }
  function message(error) {
    if (error?.message === 'PUSH_SUBSCRIPTION_BOUND') return '이 브라우저에 다른 계정의 알림 연결이 남아 있어요. 연결 다시 설정을 누르면 이 기기를 현재 계정으로 연결해요.';
    if (error?.message === 'PUSH_KEY_CHANGED') return '이 기기의 이전 알림 연결을 다시 설정해야 해요. 연결 다시 설정을 눌러 주세요.';
    if (error?.message === 'REVISION_CONFLICT') return '다른 창에서 연결이 바뀌었어요. 다시 확인한 뒤 설정해 주세요.';
    if (error?.message === 'PUSH_DEVICE_LIMIT') return '등록 가능한 기기 수를 넘었어요. 사용하지 않는 기기의 알림 연결을 먼저 해제해 주세요.';
    if (error?.message === 'PUSH_WORKER_SCOPE_IN_USE') return '기기 알림을 연결하지 못했어요. 다른 창을 닫고 다시 시도해 주세요.';
    if (error?.name === 'NotAllowedError') return '알림 권한이 허용되지 않았어요. 브라우저 설정을 확인해 주세요.';
    return '기기 알림 연결을 확인하지 못했어요. 선택을 유지했으니 다시 시도해 주세요.';
  }
  async function load() {
    if (!alive() || pending || !product) return false;
    busy(true); reload.hidden = true;
    try {
      const value = await adapter.request('/notification-push', null, controller.signal); if (!alive()) return false;
      if (!validConfiguration(value)) throw Error('PUSH_RESPONSE_INVALID'); configuration = value;
      try {const saved = window.localStorage.getItem(cacheKey); if (/^[a-f0-9]{64}$/.test(saved || '')) currentId = saved;} catch {}
      if (supported) {
        const registration = await window.navigator.serviceWorker.getRegistration('/');
        if (!alive()) return false;
        const worker = registration?.active || registration?.waiting || registration?.installing;
        if (worker?.scriptURL === new URL(value.serviceWorker, window.location.href).href) {
          subscription = await registration.pushManager.getSubscription();
          if (subscription) {const id = await digest(subscription.endpoint); if (!alive()) return false; remember(id);}
        }
      }
      status.textContent = ''; return true;
    } catch (error) {if (alive()) {status.textContent = message(error); reload.hidden = false;} return false;}
    finally {if (alive()) busy(false);}
  }
  async function registrationForPush() {
    const service = window.navigator.serviceWorker, expected = new URL(configuration.serviceWorker, window.location.href).href;
    let registration = await service.getRegistration('/');
    const worker = registration?.active || registration?.waiting || registration?.installing;
    if (worker && worker.scriptURL !== expected) throw Error('PUSH_WORKER_SCOPE_IN_USE');
    registration ||= await service.register(configuration.serviceWorker, {scope: '/', updateViaCache: 'none'});
    if (!registration.active) {
      let timeout; try {await Promise.race([service.ready, new Promise((_, reject) => {timeout = window.setTimeout(() => reject(Error('PUSH_WORKER_NOT_READY')), 10000);})]);}
      finally {window.clearTimeout(timeout);}
    }
    return registration;
  }
  async function save(body) {
    if (!alive()) return null;
    const signature = JSON.stringify(body);
    if (retry?.signature !== signature) retry = {...body, signature, requestKey: window.crypto.randomUUID()};
    const {signature: _, ...command} = retry;
    const result = await adapter.request('/notification-push', command, controller.signal);
    if (!alive()) return null;
    if (!result || result.revision !== body.expectedRevision + 1 || result.active !== (body.action === 'subscribe') || !/^[a-f0-9]{64}$/.test(result.id) ||
      body.action === 'unsubscribe' && result.id !== body.id) throw Error('PUSH_RESPONSE_INVALID');
    configuration.registrations = [...configuration.registrations.filter(item => item.id !== result.id), result];
    remember(result.id); retry = null; return result;
  }
  async function change() {
    if (!alive() || pending || !product) return;
    const saved = ownRegistration(), disabling = saved?.active === true || retry?.action === 'unsubscribe';
    if (!disabling && (!configuration?.available || !supported)) return;
    // Permission is requested synchronously from this click, never from mount,
    // refresh, a transport result, a preference switch, or a QA fixture.
    busy(true); reload.hidden = true; status.textContent = disabling ? '이 기기의 알림을 해제하는 중이에요.' : '이 기기의 알림을 연결하는 중이에요.';
    try {
      const permission = !disabling && window.Notification.permission !== 'granted' ? window.Notification.requestPermission() : null;
      if (disabling) {
        if (subscription) {await subscription.unsubscribe(); subscription = null;}
        const body = retry?.action === 'unsubscribe' ? {action: 'unsubscribe', expectedRevision: retry.expectedRevision, id: retry.id} : {action: 'unsubscribe', expectedRevision: saved.revision, id: saved.id};
        if (await save(body)) status.textContent = '이 기기 알림을 해제했어요. 브라우저의 알림 권한은 브라우저 설정에서 바꿀 수 있어요.';
      } else {
        if (permission && await permission !== 'granted') {status.textContent = '알림을 허용하지 않아 기기를 등록하지 않았어요.'; return;}
        if (!alive()) return;
        const registration = await registrationForPush(); if (!alive()) return;
        subscription = await registration.pushManager.getSubscription();
        if (!alive()) return;
        if (resetBinding && subscription) {await subscription.unsubscribe(); subscription = null; resetBinding = false;}
        if (subscription?.options?.applicationServerKey) {
          const key = window.btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
          if (key !== configuration.publicKey) throw Error('PUSH_KEY_CHANGED');
        }
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: decode(configuration.publicKey)});
          if (!alive()) {await subscription.unsubscribe(); return;}
        }
        const id = await digest(subscription.endpoint); remember(id);
        const body = {action: 'subscribe', expectedRevision: configuration.registrations.find(row => row.id === id)?.revision || 0,
          applicationServerKey: configuration.publicKey, consent: 'granted', subscription: subscription.toJSON()};
        if (await save(body)) status.textContent = '이 기기의 알림 연결을 저장했어요.';
      }
    } catch (error) {
      if (alive()) {
        status.textContent = message(error); resetBinding = ['PUSH_SUBSCRIPTION_BOUND', 'PUSH_KEY_CHANGED'].includes(error?.message);
        reload.hidden = error?.message !== 'REVISION_CONFLICT';
      }
    } finally {if (alive()) busy(false);}
  }
  const click = () => {void change();}, refresh = () => {void load();};
  toggle.addEventListener('click', click); reload.addEventListener('click', refresh);
  function dispose() {
    if (disposed) return; disposed = true; controller.abort(); signal?.removeEventListener('abort', dispose);
    toggle.removeEventListener('click', click); reload.removeEventListener('click', refresh); root.remove();
  }
  if (signal?.aborted) dispose(); else signal?.addEventListener('abort', dispose, {once: true});
  render(); dispose.ready = !disposed && product ? load() : Promise.resolve(false); return dispose;
}
