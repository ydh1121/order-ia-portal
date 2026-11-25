import {browserFunction} from '../browser-source.mjs';
import {defaultNotificationPreferences, validNotificationPreferenceCommand} from './notification-preferences-contract.mjs';

const once = (source, before, after) => {
  if ((source.match(before) || []).length !== 1) throw Error('RESEARCH_NOTIFICATION_FIXTURE_SOURCE_CHANGED');
  return source.replace(before, () => after);
};

/** Extend only the research transport; historical fixture bytes remain sealed.
 * Existing scenario delays, actor checks, cancellation and replay are retained. */
export function researchNotificationFixtureSource(source) {
  // Function serialization happens after the Worker bundler has normalized
  // whitespace and quote characters. Match a unique syntax landmark in both
  // authored and bundled code, while still failing closed on structural drift.
  source = once(source, /\bnotifications\s*:\s*\[/g, 'notificationPreferences:{},\n  notifications:[');
  // Message types are declared by the transport; the reader never guesses a
  // destination from a user's title or body text.
  source = once(source, /\bid\s*:\s*(['"])qa-notice-1\1/g, "id:'qa-notice-1',category:'delivery'");
  source = once(source, /\bid\s*:\s*(['"])qa-notice-2\1/g, "id:'qa-notice-2',category:'news'");
  source = once(source, /\[\s*(['"])\/account\1\s*,\s*(['"])\/notifications\2\s*,\s*(['"])\/purchases\3/g, "['/account','/notifications','/notification-preferences','/purchases'");
  source = once(source, /\bconst\s+fingerprint\s*=\s*body\s*\?/g, "if(domain==='product'&&path==='/notification-preferences')requireMember();\n   const fingerprint=body?");
  source = once(source, /\bif\s*\(\s*path\s*===\s*(['"])\/notifications\1\s*\)\s*\{/g, `if(path==='/notification-preferences'){
   const key=controls.persona,current=data.notificationPreferences[key]||{revision:0,preferences:(${browserFunction(defaultNotificationPreferences)})(),updatedAt:null,delivery:{webPush:false}};
   if(!body)return copy(current);
   if(!(${browserFunction(validNotificationPreferenceCommand)})(body))fail('INVALID_NOTIFICATION_PREFERENCES');
   revision(body,current.revision);
   const result={revision:current.revision+1,preferences:copy(body.preferences),updatedAt:now,delivery:{webPush:false}};
   data.notificationPreferences[key]=result;return copy(result);
  }
  if(path==='/notifications'){`);
  return source;
}
