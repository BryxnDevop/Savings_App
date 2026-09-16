import { createContext, useContext, useEffect, useState } from 'react';
const Context = createContext(null);
export function I18nProvider({ children }) {
  const [language, setLanguage] = useState(() => { try { return localStorage.getItem('ahorra_language') === 'en' ? 'en' : 'es'; } catch { return 'es'; } });
  useEffect(() => { document.documentElement.lang = language; try { localStorage.setItem('ahorra_language', language); } catch {} }, [language]);
  const t = (es, en) => language === 'en' ? en : es;
  const locale = language === 'en' ? 'en-US' : 'es-DO';
  const money = (cents, currency) => new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
  const date = value => new Date(value + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const error = value => {
    const pair = ERRORS[value?.code || value?.message || value];
    if (pair) return t(...pair);
    return t('Revisa los importes, las fechas y el formato de los datos e inténtalo de nuevo.', 'Check the amounts, dates and data format, then try again.');
  };
  return <Context.Provider value={{ language, setLanguage, t, locale, money, date, error }}>{children}</Context.Provider>;
}
export const useI18n = () => useContext(Context);
export const categoryName = (key, t) => t(...({ savings: ['Ahorro','Savings'], salary:['Salario','Salary'], extra:['Ingreso extra','Extra income'], food:['Alimentación','Food'], home:['Hogar','Home'], transport:['Transporte','Transport'], leisure:['Ocio','Leisure'], health:['Salud','Health'], other:['Otros','Other'] }[key] || ['Otros','Other']));
const ERRORS = {
  MAIL_KEY_MISSING: ['Falta la clave de cifrado del servidor. Ejecuta la configuración y reconstruye la app.', 'Server encryption key is missing. Run setup and rebuild the app.'],
  MAIL_INVALID_SETTINGS: ['Revisa el correo, los remitentes y las etiquetas de lectura.', 'Check the email, senders and reading labels.'],
  MAIL_APP_PASSWORD: ['Usa la contraseña de aplicación de Google de 16 letras.', 'Use the 16-letter Google app password.'],
  MAIL_CONNECT_FAILED: ['No se pudo conectar con Gmail. Comprueba el correo, la contraseña de aplicación, los permisos de tu cuenta y la conexión a internet.', 'Could not connect to Gmail. Check the address, app password, account permissions and internet connection.'],
  MAIL_CHECK_FAILED: ['Falló la revisión de Gmail. Los movimientos ya guardados se conservan. Revisa la conexión; si cambiaste tu contraseña de Google, vuelve a conectar Gmail.', 'Gmail check failed. Saved movements are kept. Check connectivity; if you changed your Google password, reconnect Gmail.'],
  MAIL_RECONNECT: ['Es necesario desconectar y volver a conectar Gmail.', 'Disconnect and reconnect Gmail.'],
  MAIL_WAIT: ['Espera un minuto entre revisiones. Verifica que la conexión esté activa.', 'Wait a minute between checks. Make sure the connection is enabled.'],
  MAIL_NO_CANDIDATE: ['Este aviso no tiene un movimiento interpretable. Puedes omitirlo y registrar el movimiento manualmente.', 'This alert has no readable movement. Dismiss it and enter the movement manually.'],
  MAIL_DUPLICATE_REFERENCE: ['Esta referencia bancaria ya fue registrada; no se aplicó otra vez.', 'This bank reference was already recorded; it was not applied again.'],
  MAIL_WALLET_LIMIT: ['El movimiento supera los límites del registro. Revisa los importes y las tasas.', 'The movement exceeds ledger limits. Check amounts and rates.'],

  NETWORK_ERROR: ['No hay conexión con el servidor. El cambio no está confirmado; vuelve a conectar y revisa tus datos antes de repetirlo.', 'Cannot reach the server. The change is unconfirmed; reconnect and check your data before retrying.'],
  DATABASE_UNAVAILABLE: ['PostgreSQL no está disponible. No se confirmó el cambio. Vuelve a intentarlo cuando se restablezca la conexión.', 'PostgreSQL is unavailable. The change was not confirmed. Try again when the connection is restored.'],
  UNAUTHORIZED: ['Tu sesión terminó. Inicia sesión de nuevo.', 'Your session has ended. Please sign in again.'],
  INVALID_CREDENTIALS: ['Correo o contraseña incorrectos.', 'Incorrect email or password.'],
  ACCOUNT_EXISTS: ['Ese correo ya tiene una cuenta. Inicia sesión.', 'That email already has an account. Please sign in.'],
  INVALID_EMAIL: ['Escribe un correo válido.', 'Enter a valid email address.'],
  PASSWORD_LENGTH: ['La contraseña debe tener entre 10 y 128 caracteres.', 'Your password must contain 10 to 128 characters.'],
  PASSWORD_MISMATCH: ['Las contraseñas no coinciden.', 'The passwords do not match.'],
  TOO_MANY_ATTEMPTS: ['Demasiados intentos. Espera 10 minutos y vuelve a intentarlo.', 'Too many attempts. Wait 10 minutes and try again.'],
  CONFLICT: ['Los datos cambiaron en otra ventana. Ya se cargó la versión actual; cierra este formulario, revisa los datos y vuelve a abrirlo.', 'Data changed in another window. The latest version was loaded; close this form, review the data and reopen it.'],
  INVALID_NAME: ['Escribe un nombre de 1 a 80 caracteres.', 'Enter a name containing 1 to 80 characters.'],
  INVALID_AVATAR: ['Selecciona una imagen PNG, JPG o WebP válida de hasta 5 MB.', 'Choose a valid PNG, JPG or WebP image up to 5 MB.'],
  INVALID_RATES: ['Usa tasas positivas, con un máximo de seis decimales. USD debe valer 1.', 'Use positive rates with at most six decimal places. USD must equal 1.'],
  RATES_UNAVAILABLE: ['No se pudieron consultar las tasas. Tus tasas anteriores se conservan; puedes editarlas manualmente.', 'Rates could not be retrieved. Your previous rates are unchanged; you can edit them manually.'],
  INVALID_BACKUP: ['El archivo no es un respaldo válido de Ahorra+.', 'This file is not a valid Ahorra+ backup.'],
  IMPORT_CONFLICT: ['Un registro del archivo tiene el mismo ID y datos distintos. La importación se canceló para conservar tus registros.', 'A record has the same ID but different data. Import was cancelled to preserve your records.'],
  INVALID_LEDGER: ['Hay datos no válidos. Revisa los campos antes de guardar.', 'Some data is invalid. Check the fields before saving.'],
  FILE_TOO_LARGE: ['El archivo supera los 10 MB.', 'The file exceeds 10 MB.'],
  AMOUNT_TOO_LARGE: ['La conversión supera el límite de importes. Revisa las tasas.', 'The conversion exceeds the amount limit. Check the rates.'],
  BUSY: ['Hay un guardado en curso. Espera a que termine.', 'A save is in progress. Please wait.'],
};
