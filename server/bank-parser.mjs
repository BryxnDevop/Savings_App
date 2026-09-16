import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
const clean = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function validateMailSettings(input) {
  const email = String(input.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('MAIL_INVALID_SETTINGS');
  const senders = [...new Set(String(input.senders || '').split(/[\n,;]/).map(s => s.trim().toLowerCase()).filter(Boolean))];
  if (!senders.length || senders.length > 10 || senders.some(s => !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s) || s.length > 254)) throw new Error('MAIL_INVALID_SETTINGS');
  const settings = { email, senders, automatic: input.automatic === true, decimal: input.decimal === ',' ? ',' : '.', amountLabel: input.amountLabel, expenseWord: input.expenseWord, incomeWord: input.incomeWord || '', referenceLabel: input.referenceLabel || '' };
  for (const key of ['amountLabel','expenseWord','incomeWord','referenceLabel']) {
    settings[key] = String(settings[key] || '').trim();
    if (settings[key].length > 50 || /[\r\n]/.test(settings[key])) throw new Error('MAIL_INVALID_SETTINGS');
  }
  if (!settings.amountLabel || !settings.expenseWord || (settings.incomeWord && clean(settings.expenseWord) === clean(settings.incomeWord))) throw new Error('MAIL_INVALID_SETTINGS');
  return settings;
}
export function authenticatedSender(mail, sender) {
  // Gmail prepends its Authentication-Results. Do not trust arbitrary sender headers.
  const header = (mail.headerLines || []).find(h => h.key?.toLowerCase() === 'authentication-results' && /^authentication-results:\s*mx\.google\.com\s*;/i.test(h.line));
  if (!header) return false;
  const value = header.line.replace(/\r?\n\s+/g, ' ');
  const domain = sender.split('@')[1];
  const dmarc = value.match(/(?:;|\s)dmarc=pass\b[^;]*\bheader\.from=([^\s;]+)/i);
  const dkim = [...value.matchAll(/(?:;|\s)dkim=pass\b([^;]*)/gi)].some(m => {
    const signing = m[1].match(/header\.(?:d|i)=([^\s;]+)/i)?.[1]?.replace(/^.*@/, '').toLowerCase();
    return signing === domain || signing?.endsWith('.' + domain);
  });
  return dmarc?.[1]?.toLowerCase() === domain && dkim;
}
export function parseBankMail(mail, settings, receivedAt) {
  const from = mail.from?.value || [];
  const sender = from.length === 1 ? String(from[0].address || '').toLowerCase() : '';
  if (!settings.senders.includes(sender)) return null;
  const text = clean(`${mail.subject || ''}\n${mail.text || ''}`).slice(0,100000);
  const base = { sender, subject: String(mail.subject || '').slice(0,160), receivedAt: new Date(receivedAt).toISOString(), candidate: null, issue: '' };
  if (/\bno\s+(?:(?:fue|se|ha|pudo|esta)\s+){0,3}(?:aprob|autoriz|realiz|complet|proces)|\bnot\s+(?:approved|authorized|completed|processed)\b/.test(text)) return { ...base, issue: 'NOT_CONFIRMED' };
  if (/\b(rechazad[oa]|declinad[oa]|declined|denied|anulad[oa]|cancelad[oa]|cancelled|pending|pendiente|revers[oa]|reversal|reembols[oa]|refund|intento|attempt|solicitud|request)\b/.test(text)) return { ...base, issue: 'NOT_CONFIRMED' };
  const has = word => word && new RegExp(`(?:^|[^a-z0-9])${escape(clean(word))}(?=$|[^a-z0-9])`).test(text);
  const expense = has(settings.expenseWord), income = has(settings.incomeWord);
  if ((!expense && !income) || (expense && income)) return { ...base, issue: 'TYPE_UNCLEAR' };
  const amountLine = new RegExp(`(?:^|\\n|\\b)${escape(clean(settings.amountLabel))}\\s*[:=\\-]?\\s*((?:usd|dop|eur|mxn|cop|rd\\$|us\\$|€)\\s*[0-9][0-9.,]*|[0-9][0-9.,]*\\s*(?:usd|dop|eur|mxn|cop|rd\\$|us\\$|€))(?=$|[\\s;])`, 'g');
  const matches = [...text.matchAll(amountLine)];
  if (matches.length !== 1) return { ...base, issue: 'AMOUNT_UNCLEAR' };
  const token = matches[0][1];
  const currencyToken = token.match(/usd|dop|eur|mxn|cop|rd\$|us\$|€/)[0];
  const currency = ({'rd$':'DOP','us$':'USD','€':'EUR'})[currencyToken] || currencyToken.toUpperCase();
  const number = token.match(/[0-9][0-9.,]*/)[0];
  const valid = settings.decimal === ',' ? /^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+,\d{2}$/ : /^\d{1,3}(?:,\d{3})*\.\d{2}$|^\d+\.\d{2}$/;
  if (!valid.test(number)) return { ...base, issue: 'AMOUNT_UNCLEAR' };
  const amountCents = Number(number.replace(/[.,]/g,''));
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 99999999999) return { ...base, issue: 'AMOUNT_UNCLEAR' };
  const references = settings.referenceLabel ? [...text.matchAll(new RegExp(`\\b${escape(clean(settings.referenceLabel))}\\s*[:=#-]?\\s*([a-z0-9][a-z0-9-]{4,79})(?=$|[\\s;.,])`, 'g'))] : [];
  const reference = references.length === 1 ? references[0][1] : '';
  const type = expense ? 'expense' : 'income';
  const confirmed = /\b(aprobado|aprobada|autorizado|autorizada|realizado|realizada|exitoso|exitosa|confirmado|confirmada|efectuado|efectuada|approved|authorized|completed|successful|processed)\b/.test(text);
  // Receipt date is deliberately used; never guess ambiguous DD/MM versus MM/DD.
  const date = new Date(receivedAt).toISOString().slice(0,10);
  const candidate = { type, amountCents, currency, date, reason: String(mail.subject || 'Movimiento bancario').slice(0,80), category:'other', note:'Correo bancario · fecha de recepción UTC' };
  const fingerprint = reference ? digest(`${sender}|${reference}|${currency}|${type}`) : null;
  return { ...base, candidate, fingerprint, issue: !authenticatedSender(mail,sender) ? 'SENDER_UNVERIFIED' : !reference ? 'REFERENCE_MISSING' : !confirmed ? 'CONFIRMATION_MISSING' : '' };
}
