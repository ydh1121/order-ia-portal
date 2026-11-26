import {browserFunction} from './browser-source.mjs';
import {createCommonControlPaint} from './r3-common-motion.mjs';
import {validNotificationPreferences} from './research-app/notification-preferences-contract.mjs';
import {mountNotificationPreferences} from './research-app/notification-preferences-ui.mjs';
import {mountNotificationPush} from './research-app/notification-push-ui.mjs';
import {researchNotificationsCss} from './research-app/notifications-style.mjs';

export const notificationSettingsCss = researchNotificationsCss;
export function notificationSettingsBootstrap() {
  // Inject the same component functions and their explicit dependencies. There
  // is no parallel product implementation or dynamic eval in the browser.
  return `(function(createCommonControlPaint,validNotificationPreferences,mountNotificationPush){window.ORDER_NOTIFICATION_SETTINGS={mount:(${browserFunction(mountNotificationPreferences)})};})(${browserFunction(createCommonControlPaint)},${browserFunction(validNotificationPreferences)},${browserFunction(mountNotificationPush)});`;
}
