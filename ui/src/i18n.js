// Every user-visible string goes through t(). The English text is the key, so the
// source stays readable and a missing translation falls back to English.
import {tr} from './locales/tr.js';

const catalogs = {tr};
let lang = 'en';

export function resolveLanguage(preference) {
  if (preference === 'en' || preference === 'tr') return preference;
  return /^tr\b/i.test(navigator.language || '') ? 'tr' : 'en';
}
export function setLanguage(preference) {
  lang = resolveLanguage(preference);
  document.documentElement.lang = lang;
}
export const language = () => lang;
/** BCP 47 tag for dates and numbers. */
export const locale = () => lang === 'tr' ? 'tr-TR' : 'en-US';

export function t(text, vars) {
  let out = catalogs[lang]?.[text] ?? text;
  if (vars) for (const key of Object.keys(vars)) out = out.replaceAll('{' + key + '}', vars[key]);
  return out;
}
/** Picks a singular or plural phrase; both go through t(). */
export const plural = (n, one, many) => t(n === 1 ? one : many, {n});
