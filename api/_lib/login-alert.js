// api/_lib/login-alert.js
//
// Piezas del aviso "inicio de sesión desde un dispositivo nuevo": nombre corto del dispositivo, país aproximado, hora local y el texto del mail
// en los 6 idiomas. El mail NO lleva enlaces a propósito (así nadie lo confunde con un phishing): dice qué hacer dentro de la app.
// (Los textos de pt/fr/it/de necesitan revisión de alguien nativo, como el resto de esos idiomas.)

const LANGS = ['es', 'en', 'pt', 'fr', 'it', 'de'];
const pickLang = l => (LANGS.includes(l) ? l : 'es');

const APP_WORD = { es: 'app', en: 'app', pt: 'app', fr: 'appli', it: 'app', de: 'App' };
const BROWSER_WORD = { es: 'navegador', en: 'browser', pt: 'navegador', fr: 'navigateur', it: 'browser', de: 'Browser' };
const UNKNOWN_DEVICE = { es: 'dispositivo desconocido', en: 'unknown device', pt: 'dispositivo desconhecido', fr: 'appareil inconnu', it: 'dispositivo sconosciuto', de: 'unbekanntes Gerät' };
const UNKNOWN_PLACE = { es: 'desconocido', en: 'unknown', pt: 'desconhecido', fr: 'inconnu', it: 'sconosciuto', de: 'unbekannt' };

// Sistema operativo y si es la app (WebView de Android: "; wv)") o un navegador. Solo para que la persona reconozca el dispositivo.
function deviceLabel(ua, lang) {
  const s = String(ua || '').slice(0, 400);
  const l = pickLang(lang);
  let os = null;
  if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(s)) os = /iPad/i.test(s) ? 'iPad' : 'iPhone';
  else if (/Windows/i.test(s)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(s)) os = 'Mac';
  else if (/Linux|X11/i.test(s)) os = 'Linux';
  if (!os) return UNKNOWN_DEVICE[l];
  const isApp = /; wv\)/.test(s) || /Capacitor/i.test(s);
  return os + ' · ' + (isApp ? APP_WORD[l] : BROWSER_WORD[l]);
}

// País aproximado a partir del código que manda Vercel (x-vercel-ip-country). Sin IP: solo el nombre del país.
function countryCode(v) {
  const c = String(v || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' ? c : null;
}
function placeName(code, lang) {
  const l = pickLang(lang);
  if (!code) return UNKNOWN_PLACE[l];
  try { return new Intl.DisplayNames([l], { type: 'region' }).of(code) || code; } catch (e) { return code; }
}

// Fecha y hora en la zona de la persona (si la app la mandó y es válida), si no en UTC.
function whenText(now, tz, lang) {
  const l = pickLang(lang);
  const date = new Date(now);
  try {
    return new Intl.DateTimeFormat(l, { dateStyle: 'long', timeStyle: 'short', timeZone: tz }).format(date) + ' (' + tz + ')';
  } catch (e) {
    return new Intl.DateTimeFormat(l, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' (UTC)';
  }
}

const COPY = {
  es: {
    subject: 'Nuevo inicio de sesión en tu cuenta de Zancada',
    body: ({ when, device, place }) => [
      'Hola,', '',
      'Detectamos un inicio de sesión en tu cuenta de Zancada desde un dispositivo que no habíamos visto antes.', '',
      'Cuándo: ' + when, 'Dispositivo: ' + device, 'Lugar aproximado: ' + place, '',
      'Si fuiste vos, no tenés que hacer nada.', '',
      'Si no fuiste vos:',
      '1. Cambiá tu contraseña ahora: en la pantalla de ingreso tocá «Olvidé mi contraseña».',
      '2. Escribinos a info@zancada.org y lo revisamos juntos.', '',
      'Este aviso no tiene enlaces a propósito: entrá siempre desde la app.', '', '— Zancada']
  },
  en: {
    subject: 'New sign-in to your Zancada account',
    body: ({ when, device, place }) => [
      'Hi,', '',
      'We noticed a sign-in to your Zancada account from a device we hadn’t seen before.', '',
      'When: ' + when, 'Device: ' + device, 'Approximate location: ' + place, '',
      'If it was you, there is nothing to do.', '',
      'If it wasn’t you:',
      '1. Change your password now: on the sign-in screen tap “Forgot my password”.',
      '2. Write to us at info@zancada.org and we’ll look into it together.', '',
      'This message has no links on purpose: always open the app yourself.', '', '— Zancada']
  },
  pt: {
    subject: 'Novo login na sua conta do Zancada',
    body: ({ when, device, place }) => [
      'Olá,', '',
      'Detectamos um login na sua conta do Zancada a partir de um dispositivo que ainda não tínhamos visto.', '',
      'Quando: ' + when, 'Dispositivo: ' + device, 'Local aproximado: ' + place, '',
      'Se foi você, não precisa fazer nada.', '',
      'Se não foi você:',
      '1. Troque sua senha agora: na tela de login toque em “Esqueci minha senha”.',
      '2. Escreva para info@zancada.org e vamos analisar juntos.', '',
      'Este aviso não tem links de propósito: abra sempre o app por conta própria.', '', '— Zancada']
  },
  fr: {
    subject: 'Nouvelle connexion à ton compte Zancada',
    body: ({ when, device, place }) => [
      'Salut,', '',
      'Nous avons détecté une connexion à ton compte Zancada depuis un appareil que nous n’avions jamais vu.', '',
      'Quand : ' + when, 'Appareil : ' + device, 'Lieu approximatif : ' + place, '',
      'Si c’était toi, il n’y a rien à faire.', '',
      'Si ce n’était pas toi :',
      '1. Change ton mot de passe maintenant : sur l’écran de connexion, appuie sur « Mot de passe oublié ».',
      '2. Écris-nous à info@zancada.org et on regarde ça ensemble.', '',
      'Ce message n’a pas de lien, exprès : ouvre toujours l’appli toi-même.', '', '— Zancada']
  },
  it: {
    subject: 'Nuovo accesso al tuo account Zancada',
    body: ({ when, device, place }) => [
      'Ciao,', '',
      'Abbiamo rilevato un accesso al tuo account Zancada da un dispositivo che non avevamo mai visto.', '',
      'Quando: ' + when, 'Dispositivo: ' + device, 'Luogo approssimativo: ' + place, '',
      'Se eri tu, non devi fare nulla.', '',
      'Se non eri tu:',
      '1. Cambia subito la password: nella schermata di accesso tocca «Password dimenticata».',
      '2. Scrivici a info@zancada.org e controlliamo insieme.', '',
      'Questo avviso non ha link di proposito: apri sempre l’app da solo.', '', '— Zancada']
  },
  de: {
    subject: 'Neue Anmeldung bei deinem Zancada-Konto',
    body: ({ when, device, place }) => [
      'Hallo,', '',
      'Wir haben eine Anmeldung bei deinem Zancada-Konto von einem Gerät festgestellt, das wir noch nicht kannten.', '',
      'Wann: ' + when, 'Gerät: ' + device, 'Ungefährer Ort: ' + place, '',
      'Wenn du es warst, musst du nichts tun.', '',
      'Wenn du es nicht warst:',
      '1. Ändere jetzt dein Passwort: Tippe auf dem Anmeldebildschirm auf „Passwort vergessen“.',
      '2. Schreib uns an info@zancada.org, dann sehen wir es uns gemeinsam an.', '',
      'Diese Nachricht enthält absichtlich keine Links: Öffne die App immer selbst.', '', '— Zancada']
  }
};

function buildAlertEmail({ lang, ua, countryHeader, tz, now }) {
  const l = pickLang(lang);
  const info = {
    when: whenText(now === undefined ? Date.now() : now, tz, l),
    device: deviceLabel(ua, l),
    place: placeName(countryCode(countryHeader), l)
  };
  return { subject: COPY[l].subject, text: COPY[l].body(info).join('\n') };
}

module.exports = { LANGS, pickLang, deviceLabel, countryCode, placeName, whenText, buildAlertEmail };
