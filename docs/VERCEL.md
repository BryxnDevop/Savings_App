# Desplegar Ahorra+ 4.1 en Vercel

## Qué se corrigió

El ZIP anterior no tenía `api/` ni `vercel.json`. Publicar su carpeta `dist` mostraba React, pero no ejecutaba la API Node que procesa el login y guarda los registros. Una respuesta HTML/404 donde se esperaba JSON terminaba en «No hay conexión con el servidor».

Esta edición incorpora una función Node (`api/index.js`), rutas `/api/*`, reutilización del pool y cookies HTTPS. No inicia un servidor ni depende de temporizadores en Vercel. También soporta el cuerpo JSON ya procesado por Vercel. Los errores de configuración se distinguen de los fallos de red.

No se han consultado los logs de tu despliegue ni se ha publicado en tu cuenta: estos cambios corrigen la carencia encontrada en el proyecto adjunto. La verificación final se hace con `/api/health` después del despliegue.

## 1. Reemplazar el proyecto

Conserva tu `.env` y una copia de seguridad. Copia los archivos de la carpeta `ahorra-plus` actualizada sobre tu proyecto. Incluye **`api/`, `server/`, `src/`, `supabase/`, `public/`, `scripts/`, `package.json`, `package-lock.json` y `vercel.json`**; no publiques solamente `dist`.

Instala Node.js **24 LTS**. Desde `ahorra-plus`:

```powershell
npm ci
npm run build
```

Esta edición añade tablas privadas para suscripciones Web Push y estado de entrega. **Aunque ya tengas Ahorra+ funcionando, aplica la migración nueva antes del despliegue**. Vincula tu proyecto y ejecuta:

```powershell
npx supabase db push
```

La migración no borra movimientos, usuarios ni pagos existentes.

## 2. Configuración de Vercel

Importa tu repositorio en Vercel o actualiza el que ya usabas. En Settings → Build and Deployment:

| Campo | Valor |
|---|---|
| Root Directory | La carpeta que contiene `package.json`, `vercel.json` y `api/`: normalmente `ahorra-plus`, o `Aplication/ahorra-plus` si subiste la carpeta exterior completa. |
| Framework Preset | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 24.x |
| Fluid Compute | Activado; la función está configurada para un máximo de 300 segundos. |

El archivo `vercel.json` ya contiene los comandos, las rutas y el límite de la función. Elimina cualquier regla antigua que envíe `/api/*` a `index.html` o a localhost. La API y la web deben pertenecer al mismo proyecto y dominio.

## 3. Variables de entorno

En **Settings → Environment Variables**, configura valores del servidor para **Production**. Si pruebas Preview, configura también ese entorno; lo recomendable es una base de pruebas separada.

| Variable | Qué poner |
|---|---|
| `DATABASE_URL` | URI de la base Supabase, con contraseña real y sus caracteres especiales codificados. Copia Connect → Session pooler (5432). También se admite Transaction pooler (6543) en Vercel. No es la URL HTTPS de Supabase ni una clave API. |
| `MAIL_ENCRYPTION_KEY` | Exactamente la misma clave de 64 caracteres hexadecimales que usabas, para conservar Gmail. Si no tienes una, genérala con `npm run setup` en tu PC. |
| `APP_TIME_ZONE` | `America/Santo_Domingo`. |
| `APP_ORIGIN` | URL HTTPS exacta de tu aplicación, por ejemplo `https://mi-ahorra.vercel.app`. Con dominio personalizado, usa ese dominio. **Nunca `http://localhost:4173` en Vercel.** Puedes omitirla para usar los dominios automáticos que proporciona Vercel. |
| `CRON_SECRET` | Clave aleatoria de al menos 32 caracteres, para activar las revisiones programadas. No es la contraseña de la base ni una clave Supabase. |
| `DB_SSL_CA_CERT` | Si Supabase necesita un certificado raíz propio, pega aquí su contenido PEM completo. Se aceptan saltos de línea reales o `\n`. |
| `VAPID_PUBLIC_KEY` | Clave pública Web Push generada con `npm run push:keys`. |
| `VAPID_PRIVATE_KEY` | Clave privada del mismo par. Trátala como secreto y no la pongas en variables `VITE_*`. |
| `VAPID_SUBJECT` | `https://TU-DOMINIO.vercel.app` o un `mailto:` válido. Puede ser la misma URL de `APP_ORIGIN`. |

En el panel Vercel pega los valores **sin comillas exteriores**. No copies `DB_SSL_CA_FILE` con una ruta de Windows: esa ruta no existe en Vercel. Esta versión verifica TLS; si tu versión local había desactivado la validación, configura `DB_SSL_CA_CERT` con el certificado descargado de Database Settings → SSL Configuration en Supabase.

Para generar un secreto de tareas en tu PC:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copia el resultado en `CRON_SECRET` y consérvalo para el paso 5. No lo pongas en React ni en variables `VITE_*`.

Para generar las claves Web Push una sola vez:

```powershell
npm run push:keys
```

Copia `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y ajusta `VAPID_SUBJECT` en Vercel. **No regeneres estas claves en cada despliegue**: las suscripciones del navegador están vinculadas a esa clave pública.

Tu `.env` local **no configura automáticamente Vercel**. No subas ese archivo al repositorio. La entrega y `.vercelignore` excluyen credenciales y respaldos personales.

## 4. Desplegar y comprobar

Pulsa **Deploy / Redeploy** después de guardar las variables. Si ya existe un despliegue anterior, haz un nuevo despliegue: cambiar una variable no modifica la instancia publicada anteriormente.

También puedes desplegar desde la carpeta `ahorra-plus` con la CLI de Vercel después de configurarla en tu cuenta:

```powershell
npx vercel --prod
```

Abre en el navegador:

```text
https://TU-DOMINIO/api/health
```

Debe responder JSON:

```json
{"ok":true,"storage":"supabase"}
```

Si aparece HTML o un 404, revisa Root Directory, la presencia de `api/index.js` y las reglas de rutas. En Functions / Runtime Logs debe existir la función de API. Si aparece `SERVER_CONFIGURATION`, comprueba las variables y vuelve a desplegar. Si aparece `MIGRATION_REQUIRED`, verifica que la URI apunte al proyecto donde aplicaste las migraciones. Los fallos de TLS, contraseña o conectividad se consultan por código en los logs; no se imprimen las credenciales.

Después prueba:

1. Crea una cuenta: debe mostrar **Cuenta creada correctamente** y quedarse en el login, sin dashboard ni sesión automática.
2. Escribe la contraseña e inicia sesión. Registra un movimiento, recarga y comprueba que se conserva.
3. Cierra sesión: la pantalla vuelve al tema claro/blanco. El modo oscuro sigue disponible dentro de tu cuenta.
4. Pulsa tu foto y prueba Cambiar moneda.

Si tenías la PWA instalada, acepta su actualización. Si sigue mostrando una edición antigua, cierra todas sus ventanas y vuelve a abrirla desde la URL publicada. La nueva compilación genera otra versión del service worker y no cachea `/api/`.

## 5. Push, Gmail y pagos automáticos con el navegador cerrado

Vercel ejecuta funciones cuando recibe solicitudes. Los `setInterval` de una app Node local no constituyen un programador fiable en este entorno.

Esta versión usa **`/api/jobs`**, protegido con `Authorization: Bearer CRON_SECRET`. Procesa vencimientos, crea recordatorios desde **2 días antes**, revisa buzones pendientes y despacha las notificaciones Web Push. Los movimientos manuales, alertas de presupuesto y avances de meta intentan enviar push inmediatamente al guardarse.

`vercel.json` incluye además un Cron diario a las `12:00 UTC` (08:00 en Santo Domingo) como respaldo compatible con Vercel Hobby. Para comprobaciones más frecuentes puedes mantener la programación de Supabase Cron descrita abajo; no hace falta duplicarla si ya usas otro programador con mayor frecuencia.

Para usarlo también con Vercel Hobby, se incluye una programación desde **Supabase Cron**:

1. Activa `pg_cron` y `pg_net` en Supabase, desde Extensions / Integrations → Cron.
2. En **Supabase Vault**, crea `ahorra_app_url` con la URL HTTPS de producción **sin `/` final** y `ahorra_cron_secret` con el **mismo valor** de `CRON_SECRET` configurado en Vercel.
3. Abre el SQL Editor del mismo proyecto y ejecuta el contenido de `supabase/cron/activar.sql`. Está fuera de las migraciones porque requiere tu URL definitiva y tus secretos.
4. Comprueba que aparezca la tarea `ahorra-vercel-tick` en Cron. Se ejecuta cada cinco minutos. Cada buzón solo se lee cuando vence su revisión horaria; los pagos se registran en la siguiente ejecución tras su vencimiento. Puede haber unos minutos de margen y más si hay muchos pendientes.
5. En Vercel verifica una llamada a `/api/jobs` con estado 200. En Supabase puedes revisar las respuestas recientes con `select id,status_code,timed_out,error_msg from net._http_response order by id desc limit 10;`. Que Cron haya ejecutado SQL no garantiza que la llamada HTTP haya sido aceptada.

Si Deployment Protection protege también la URL de producción, utiliza el mecanismo oficial de bypass para automatizaciones de Vercel y guarda su secreto en Vault como `ahorra_vercel_bypass`. El SQL incluido lo envía solo si existe. Un 401/403 en la respuesta HTTP requiere revisar esa protección y `CRON_SECRET`.

Para detener solamente esta programación, ejecuta `supabase/cron/desactivar.sql`.

**Vercel Hobby limita la frecuencia de sus propios Cron Jobs**, por eso el cron incluido es diario y no horario. Con Vercel Pro puedes aumentar la frecuencia del cron de Vercel; alternativamente, el SQL incluido de Supabase Cron llama `/api/jobs` cada cinco minutos y permite mantener también la revisión horaria de Gmail.

Después de desplegar, entra en **Ajustes → Notificaciones push**, pulsa **Activar notificaciones** y acepta el permiso del navegador. La aplicación permite elegir pagos recurrentes, presupuesto, movimientos, metas, banco y sonido/vibración. Web Push utiliza el sonido predeterminado que permita el sistema operativo; los navegadores no ofrecen un audio personalizado consistente en todas las plataformas.

Para verificar una entrega real desde el servidor, pulsa **Probar push real con la app cerrada** y minimiza/cierra Ahorra+ inmediatamente. El endpoint autenticado `/api/push/test` espera unos 8 segundos y envía el Web Push a todas las suscripciones activas de esa cuenta. Esta prueba no usa `showNotification()` desde la página: recorre el mismo canal VAPID que usan las alertas reales.

Sin configurar un programador, **Revisar ahora** completa la revisión de tu Gmail durante la solicitud. Los pagos vencidos también se recuperan al cargar tus datos. La revisión automática con el navegador cerrado requiere completar este paso.

## Límites y diagnóstico

- Las sesiones actuales siguen siendo válidas hasta cerrar sesión o caducar. El cambio de registro afecta a nuevas cuentas, sin borrar usuarios anteriores.
- Cuentas y contraseñas siguen en el esquema privado `ahorra`; no se utiliza Supabase Auth.
- La función utiliza un pool pequeño y admite el pooler de transacciones en Vercel. Para herramientas locales y traslados, sigue usando la conexión de sesión indicada en `SUPABASE.md`.
- Vercel limita el tamaño de las solicitudes; la app acepta hasta 4 MB en este entorno. Los respaldos completos se exportan/importan con las herramientas Node locales, no a través de una función HTTP.
- El límite de intentos de autenticación es por instancia. Para una aplicación pública de gran tráfico, configura además reglas de rate limiting en Vercel Firewall.
- La frecuencia depende del programador, la disponibilidad del proyecto y los límites de ambos servicios. Consulta Runtime Logs y Cron si Gmail deja de actualizarse.

## Referencias oficiales

[Funciones Node.js](https://vercel.com/docs/functions/runtimes/node-js), [pool de conexiones](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), [duración de funciones](https://vercel.com/docs/functions/configuring-functions/duration), [límites de Cron en Hobby](https://vercel.com/docs/cron-jobs/usage-and-pricing) y [Supabase Cron con pg_net y Vault](https://supabase.com/docs/guides/functions/schedule-functions).
