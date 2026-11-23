export function defaultNotificationPreferences() {return {price: false, news: false, benefits: false};}

export function validNotificationPreferences(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 3 &&
    ['price', 'news', 'benefits'].every(key => Object.hasOwn(value, key) && typeof value[key] === 'boolean');
}

// Self-contained so the exact validation can also be installed in the research
// fixture transport without modifying its preserved original source.
export function validNotificationPreferenceCommand(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['action', 'expectedRevision', 'requestKey', 'preferences'].includes(key))) return false;
  const preferences = value.preferences;
  return value.action === 'update' && Number.isSafeInteger(value.expectedRevision) && value.expectedRevision >= 0 && value.expectedRevision <= 1e9 &&
    typeof value.requestKey === 'string' && /^[\w.:-]{1,128}$/.test(value.requestKey) &&
    !!preferences && typeof preferences === 'object' && !Array.isArray(preferences) && Object.keys(preferences).length === 3 &&
    ['price', 'news', 'benefits'].every(key => Object.hasOwn(preferences, key) && typeof preferences[key] === 'boolean');
}
