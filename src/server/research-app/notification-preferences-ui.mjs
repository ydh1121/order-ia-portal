import {validNotificationPreferences} from './notification-preferences-contract.mjs';
import {createCommonControlPaint} from '../r3-common-motion.mjs';
import {mountNotificationPush} from './notification-push-ui.mjs';

/** Optional notification consent is fetched with the settings and written only in
 * response to an explicit control change or retry. Browser push is separate. */
export function mountNotificationPreferences({container, adapter, signal} = {}) {
  if (!container?.ownerDocument || typeof adapter?.request !== 'function') throw TypeError('NOTIFICATION_PREFERENCES_CONTEXT');
  const document = container.ownerDocument, window = document.defaultView, controller = new AbortController(), cleanups = [], inputs = new Map();
  const controlPaint = createCommonControlPaint(document);
  let disposed = false, loaded = false, pending = false, revision = 0, confirmed = null, retry = null, retryMode = 'load';
  const node = (tag, text, className) => {const result = document.createElement(tag); if (text !== undefined) result.textContent = text; if (className) result.className = className; return result;};
  const root = node('section', undefined, 'research-notification-preferences'); root.dataset.notificationPreferences = '';
  root.setAttribute('aria-label', '알림 수신 설정'); root.append(node('h2', '알림 수신 설정'));
  const fieldset = node('fieldset'), legend = node('legend', '받을 알림'); fieldset.append(legend); fieldset.hidden = true;
  for (const [key, label] of [['price', '시세 변동'], ['news', '소식'], ['benefits', '혜택']]) {
    const row = node('label', undefined, 'research-notification-preference'), input = node('input'); input.type = 'checkbox'; input.name = key; input.setAttribute('role', 'switch');
    const control = node('span', undefined, 'research-notification-switch'), track = controlPaint.switchTrack();
    input.dataset.notificationPreference = key; inputs.set(key, input); control.append(input, track); row.append(node('span', label), control); fieldset.append(row);
  }
  const note = node('p', '선택한 항목의 알림만 받아요. 기기 알림은 아래에서 별도로 허용할 수 있어요.', 'research-notification-preferences-note');
  const status = node('p', '', 'research-notifications-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = node('div', undefined, 'research-notification-preference-actions');
  const retryButton = node('button', '다시 시도', 'research-notifications-retry'); retryButton.type = 'button'; retryButton.dataset.notificationPreferencesRetry = ''; retryButton.hidden = true;
  const reloadButton = node('button', '최신 설정 확인', 'research-notifications-retry'); reloadButton.type = 'button'; reloadButton.dataset.notificationPreferencesReload = ''; reloadButton.hidden = true;
  actions.append(retryButton, reloadButton); root.append(fieldset, note, status, actions); container.append(root);
  const pushControls = mountNotificationPush({container: root, adapter, signal: controller.signal});
  const alive = () => !disposed && !controller.signal.aborted && root.parentNode === container;
  const listen = (target, type, callback) => {target.addEventListener(type, callback); cleanups.push(() => target.removeEventListener(type, callback));};
  const values = () => Object.fromEntries([...inputs].map(([key, input]) => [key, input.checked]));
  const setValues = value => {for (const [key, input] of inputs) input.checked = value[key];};
  const busy = value => {pending = value; fieldset.disabled = value; retryButton.disabled = value; reloadButton.disabled = value; root.setAttribute('aria-busy', String(value));};
  const validResponse = value => Number.isSafeInteger(value?.revision) && value.revision >= 0 && validNotificationPreferences(value.preferences) &&
    (value.updatedAt === null || typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt)));
  const message = (error, phase = 'save') => phase === 'load' ? '수신 설정을 불러오지 못했어요. 선택은 유지했으니 다시 불러와 주세요.' :
    error?.message === 'NOTIFICATION_PREFERENCES_RESPONSE_INVALID' ? '저장 결과를 확인하지 못했어요. 선택은 유지했으니 다시 시도해 주세요.' :
    error?.message === 'REVISION_CONFLICT' ? '다른 창에서 설정이 변경됐어요. 선택을 유지한 채 최신 설정을 확인해 주세요.' :
      adapter.message?.(error) || error?.userMessage || '설정을 저장하지 못했어요. 선택은 유지했으니 다시 시도해 주세요.';
  async function load(preserveDraft = false) {
    if (!alive() || pending) return false;
    const draft = values(), changed = preserveDraft && confirmed ? [...inputs.keys()].filter(key => draft[key] !== confirmed[key]) : [];
    busy(true); retryButton.hidden = true; reloadButton.hidden = true; status.textContent = '수신 설정을 불러오는 중이에요.';
    try {
      const response = await adapter.request('/notification-preferences', null, controller.signal); if (!alive()) return false;
      if (!validResponse(response)) throw Error('NOTIFICATION_PREFERENCES_RESPONSE_INVALID');
      revision = response.revision; confirmed = {...response.preferences}; retry = null; loaded = true;
      setValues({...confirmed, ...Object.fromEntries(changed.map(key => [key, draft[key]]))}); fieldset.hidden = false;
      const unsaved = [...inputs.keys()].some(key => values()[key] !== confirmed[key]);
      status.textContent = unsaved ? '최신 설정을 불러왔어요. 선택한 변경은 아직 저장하지 않았어요.' : '';
      if (unsaved) {retryMode = 'save'; retryButton.textContent = '변경 저장'; retryButton.hidden = false;}
      return true;
    } catch (error) {
      if (alive()) {status.textContent = message(error, 'load'); retryMode = 'load'; retryButton.textContent = '다시 불러오기'; retryButton.hidden = false;}
      return false;
    } finally {if (alive()) busy(false);}
  }
  async function persist() {
    if (!alive() || pending || !loaded) return false;
    const submitted = values(), expectedRevision = revision, signature = JSON.stringify({expectedRevision, preferences: submitted});
    if (retry?.signature !== signature) retry = {signature, requestKey: window.crypto.randomUUID()};
    const request = {action: 'update', expectedRevision, requestKey: retry.requestKey, preferences: submitted};
    busy(true); retryButton.hidden = true; reloadButton.hidden = true; status.textContent = '수신 설정을 저장하는 중이에요.';
    try {
      const response = await adapter.request('/notification-preferences', request, controller.signal); if (!alive()) return false;
      if (!validResponse(response) || typeof response.updatedAt !== 'string' || response.revision !== expectedRevision + 1 || [...inputs.keys()].some(key => response.preferences[key] !== submitted[key])) throw Error('NOTIFICATION_PREFERENCES_RESPONSE_INVALID');
      revision = response.revision; confirmed = {...response.preferences}; retry = null; status.textContent = '수신 설정을 저장했어요.'; return true;
    } catch (error) {
      if (alive()) {
        status.textContent = message(error); retryMode = 'save'; retryButton.textContent = '다시 시도';
        if (error?.message === 'REVISION_CONFLICT') reloadButton.hidden = false; else retryButton.hidden = false;
      }
      return false;
    } finally {if (alive()) busy(false);}
  }
  for (const input of inputs.values()) listen(input, 'change', () => {void persist();});
  listen(retryButton, 'click', () => {if (retryMode === 'load') dispose.ready = load(loaded); else void persist();});
  listen(reloadButton, 'click', () => {dispose.ready = load(true);});
  function dispose() {
    if (disposed) return; disposed = true; controller.abort(); pushControls(); signal?.removeEventListener('abort', dispose);
    for (const cleanup of cleanups) cleanup(); if (root.parentNode === container) root.remove();
  }
  if (signal?.aborted) dispose(); else signal?.addEventListener('abort', dispose, {once: true});
  dispose.ready = disposed ? Promise.resolve(false) : load(); return dispose;
}
