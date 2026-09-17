# Conectar Ahorra+ a Supabase

## 1. Crear y elegir el proyecto

Crea un proyecto propio en [Supabase](https://supabase.com/dashboard). Guarda su contraseña de base de datos. Para una instalación nueva, utiliza un proyecto vacío dedicado a Ahorra+.

El **Project ref** es el identificador del proyecto que aparece en su URL del panel (`/project/IDENTIFICADOR`) y en su configuración. No es el nombre visible ni una API key.

## 2. Instalar la CLI incluida

Abre PowerShell dentro de `ahorra-plus`:

```powershell
npm ci
npm run setup
npx supabase --version
```

Se incluye Supabase CLI **2.117.0**, fijada en `package.json` y `package-lock.json`. El proyecto requiere Node.js 22.12 o superior. `npm run setup` crea `.env` con una clave de cifrado aleatoria para Gmail si no existe; conserva la configuración que ya tengas.

No hace falta `supabase init`: ya existe `supabase/config.toml`. Tampoco hace falta `supabase start` para conectarte al proyecto alojado. La ruta de ejecución normal no depende de Docker Desktop.

## 3. Vincular y aplicar la migración

```powershell
npx supabase login
npx supabase projects list
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```

Sustituye `TU_PROJECT_REF`. Inicia sesión en tu cuenta Supabase cuando la CLI lo solicite. Si pide contraseña de base, usa la del proyecto. No es la contraseña del login de Ahorra+ ni una clave API.

`--dry-run` permite revisar qué se aplicará; `db push` crea las tablas en el proyecto vinculado. La migración incluida es `20260917000000_ahorra_private.sql`. Si el destino tiene migraciones ajenas y aparecen discrepancias de historial, usa un proyecto vacío para esta instalación o revisa el historial antes de continuar; no marques migraciones como aplicadas sin ejecutarlas.

La CLI administra el esquema; la app solo verifica que exista al iniciar. Una CLI vinculada correctamente **no rellena `DATABASE_URL`**. Completa el siguiente paso con el mismo proyecto.

## 4. Conectar el servidor

En tu proyecto: **Connect → Session pooler → URI**. Copia la cadena completa en `.env`. Su forma es:

```dotenv
DATABASE_URL="postgresql://postgres.TU_PROJECT_REF:TU_PASSWORD_CODIFICADA@HOST_EXACTO_DEL_POOLER:5432/postgres"
APP_ORIGIN=http://localhost:4173
PORT=4173
APP_TIME_ZONE=America/Santo_Domingo
MAIL_ENCRYPTION_KEY=CONSERVA_LA_CLAVE_GENERADA_O_LA_ANTERIOR
DB_SSL_CA_FILE=
```

Este bloque muestra la forma; no pegues sus marcadores literalmente ni reemplaces tu clave real de Gmail. Copia el host, usuario y puerto de **tu** panel. No construyas el host a partir del nombre de la región.

Usa **Session pooler, puerto 5432**: permite conexión IPv4 y es adecuado para el servidor Node persistente. La conexión directa del panel también sirve si tu red alcanza su dirección IP. La app rechaza Transaction pooler en el puerto 6543.

Si la contraseña contiene caracteres como `@`, `#`, `:`, `/`, `%` o espacios, codifica solo la contraseña para URI. Puedes obtener el valor de manera local sin guardarlo en el historial de comandos:

```powershell
$claveSegura = Read-Host "Contraseña de la base" -AsSecureString
$credencial = New-Object System.Management.Automation.PSCredential("local", $claveSegura)
[uri]::EscapeDataString($credencial.GetNetworkCredential().Password)
Remove-Variable claveSegura, credencial
```

Funciona en Windows PowerShell 5.1 y PowerShell 7. El resultado codificado también es un secreto: úsalo únicamente en tu `.env`. No uses un sitio externo para codificar credenciales.

**TLS:** la app cifra las conexiones remotas y verifica el certificado. Si la verificación necesita el certificado raíz del proyecto, descárgalo desde **Database Settings → SSL Configuration** y guárdalo como `certs/supabase-ca.crt`. Configura:

```dotenv
DB_SSL_CA_FILE=./certs/supabase-ca.crt
```

No uses `NODE_TLS_REJECT_UNAUTHORIZED=0`. Los parámetros `sslmode` de la URL no desactivan la verificación de esta app. Las conexiones locales de desarrollo no usan TLS.

## 5. Verificar y ejecutar

Si estás trasladando una instalación anterior, importa sus datos **antes del primer inicio**, como se explica debajo.

```powershell
npm run db:check
npm start
```

El diagnóstico confirma conexión, versión de esquema y acceso a tablas. No muestra tu contraseña. Abre **http://localhost:4173**. El paquete incluye la interfaz compilada. Tras editar fuentes, ejecuta `npm run build` antes de iniciar.

Puedes ver las tablas en el editor de Supabase seleccionando el esquema **ahorra**. Las tablas no estarán en `public` ni los usuarios en la sección Authentication, porque la app conserva su sistema de cuentas.

## Trasladar tus datos desde Ahorra+ 3.2

La base antigua y Supabase son dos bases independientes. Cambiar `DATABASE_URL` no copia cuentas ni movimientos. El respaldo completo incluido traslada usuarios y contraseñas, fotos, idiomas, carteras, tasas, metas, movimientos, sesiones, conexiones Gmail cifradas, historial bancario, pagos y notificaciones. Un respaldo JSON de Ajustes solo contiene información financiera y no sustituye este traslado.

1. Guarda una copia de la carpeta anterior y exporta el respaldo financiero desde Ajustes. Reemplaza los archivos de código por esta versión conservando tu `.env` anterior. No borres el volumen `ahorra-plus_postgres_data`.
2. Dentro de la carpeta actualizada, instala dependencias y conserva la configuración anterior:

```powershell
npm ci
Copy-Item .env .env.legacy
```

Usa otro nombre si `.env.legacy` ya existe. No sobrescribas tu única copia anterior. Mantén estos archivos privados.

3. Detén la app antigua para impedir nuevos movimientos durante el traslado. El siguiente comando actúa sobre el servicio `app` del proyecto Docker existente:

```powershell
docker compose stop app
```

Si ejecutabas Node sin Docker, detén el proceso con Ctrl+C.

4. Para la base Docker de las versiones anteriores, abre Docker Desktop y ejecuta:

```powershell
docker compose --env-file .env.legacy -f compose.legacy.yaml up -d --wait db
npm run db:export -- --env .env.legacy --legacy --file backups/migracion-completa.json
```

`compose.legacy.yaml` conserva el volumen anterior y publica temporalmente su base solo en **127.0.0.1:5433**. El exportador `--legacy` usa el usuario, contraseña y nombre de base `POSTGRES_*` de `.env.legacy` para leer ese puerto y el esquema `public`. Solo lee la base. Si tu instalación antigua usa otro nombre de proyecto/volumen o un servidor propio, adapta la conexión antes de exportar; no importes una copia sin verificar que contiene tus cuentas. El comando muestra las cantidades de registros por tabla y no sobrescribe un archivo existente.

5. Vincula Supabase y aplica la migración siguiendo los pasos 1–3. En `.env`, cambia únicamente `DATABASE_URL` al proyecto Supabase y configura TLS si procede. **Conserva `MAIL_ENCRYPTION_KEY` exactamente igual a la anterior** para poder descifrar Gmail. Las variables `POSTGRES_*` antiguas ya no se usan en el arranque normal.
6. Con la app todavía detenida y las tablas de Ahorra+ del destino vacías:

```powershell
npm run db:check
npm run db:import -- --file backups/migracion-completa.json
npm start
```

La importación usa una transacción: si un registro falla, revierte todo. Rechaza un destino con datos, incluso si intentas importar el mismo archivo otra vez. No borra ni fusiona cuentas existentes. Si ya registraste una cuenta en el destino, utiliza otro proyecto vacío o prepara una migración específica con respaldos; esta herramienta no elimina datos para forzar la importación.

7. Inicia sesión con tu correo y contraseña habituales. Comprueba saldo, registros, pagos, perfil y estado de Gmail. Los vencimientos pendientes pueden registrarse al iniciar, según sus fechas; los ya procesados no se repiten. La clave Gmail no está en el JSON y necesita conservarse por separado.
8. Cuando hayas comprobado el resultado, detén la base antigua:

```powershell
docker compose --env-file .env.legacy -f compose.legacy.yaml stop db
```

Conserva el volumen y la copia anterior hasta verificar tus datos. **No ejecutes `docker compose down -v`.** Si necesitas volver atrás antes de registrar datos nuevos, detén la versión nueva y arranca la carpeta anterior con su `.env` y su volumen. Los cambios realizados después en Supabase no aparecerán automáticamente en la base antigua.

## Respaldos después de migrar

```powershell
npm run db:export -- --file backups/ahorra-completo-2026-09-17.json
```

Lee un estado consistente en una transacción. Usa un nombre nuevo cada vez. Para restaurar, aplica las migraciones a un proyecto vacío, configura su `.env` con la clave Gmail original y ejecuta `db:import` antes de iniciar la app.

El respaldo completo contiene hashes de contraseña, datos financieros y secretos Gmail cifrados. Guárdalo junto con una copia protegida de tu configuración, sin publicarlos. La carpeta `backups/` y los archivos `.env` están excluidos de Git y de la imagen Docker. No se incluyen en el ZIP de entrega.

## Docker opcional para la app

Después de vincular el proyecto, aplicar las migraciones y completar `.env`:

```powershell
docker compose up -d --build --wait
```

El Compose normal contiene **solo la app**. No inicia una base local. Requiere Docker Desktop activo; si reaparece el error `dockerDesktopLinuxEngine`, inicia Docker Desktop con contenedores Linux o utiliza `npm start`, que no necesita Docker.

Si usas certificado, colócalo como `certs/supabase-ca.crt` y configura `DB_SSL_CA_FILE=./certs/supabase-ca.crt`. Compose lo monta de solo lectura con una ruta interna. No arranques Node y Docker en el mismo puerto al mismo tiempo.

## Supabase local, solo para desarrollo

Esta alternativa sí necesita Docker y no guarda los datos en el proyecto remoto:

```powershell
npx supabase start
npx supabase db push --local
```

En una configuración local separada utiliza la Database URL que muestre la CLI, normalmente `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, y ejecuta `npm run db:check`. Mantén separados `.env` remoto/local. No ejecutes `db reset --linked` sobre tu proyecto real; un reset puede borrar datos.

## Seguridad y arquitectura

- React habla con la API Node. Solo Node conoce `DATABASE_URL` y la clave de cifrado Gmail.
- Las tablas viven en el esquema privado `ahorra`, no expuesto en la Data API. Se habilita RLS sin políticas de acceso público y se revocan permisos a `PUBLIC`, `anon`, `authenticated` y `service_role`.
- Node se conecta con el propietario `postgres` del proyecto y valida la sesión y el propietario de cada registro. Ese usuario tiene privilegios: su contraseña debe permanecer exclusivamente en el servidor. Nunca la incluyas en una variable `VITE_*` ni en el código React.
- No añadas `ahorra` a los esquemas expuestos ni habilites permisos públicos para resolver errores. No se necesita Data API, Supabase Auth ni una clave `service_role` para esta arquitectura.
- `supabase/config.toml` configura el entorno local. `db push` aplica la migración remota; no convierte automáticamente todo el archivo TOML en ajustes remotos.
- Supabase aloja la base. Gmail y los pagos programados siguen necesitando el proceso Node activo y acceso a internet. La aplicación debe servirse con HTTPS fuera de localhost.

## Problemas frecuentes

| Mensaje | Qué revisar |
|---|---|
| `supabase` no se reconoce | Ejecuta `npm ci` y luego `npx supabase`, desde `ahorra-plus`. |
| Proyecto no vinculado | Ejecuta `npx supabase login` y `npx supabase link --project-ref ...`. |
| Contraseña incorrecta / `28P01` | Contraseña de la base, codificación URI y usuario del pooler. |
| `Tenant or user not found` | Copia el usuario `postgres.PROJECT_REF` y el host exactos desde Connect. |
| Red IPv6 / `ENETUNREACH` | Usa Session pooler, puerto 5432, para IPv4. |
| Certificado / `SELF_SIGNED_CERT_IN_CHAIN` | Descarga el certificado de Supabase y configura `DB_SSL_CA_FILE`. |
| `MIGRATION_REQUIRED` | Ejecuta `npx supabase db push` y comprueba que `.env` apunta al mismo proyecto vinculado. |
| Datos vacíos | Verifica que has importado la copia completa, el proyecto y la cuenta correctos. |
| Gmail no descifra al migrar | Restaura `MAIL_ENCRYPTION_KEY` de la configuración anterior. |
| Conexión antes correcta y ahora caída | Revisa internet y el estado del proyecto en el panel Supabase; ejecuta `npm run db:check`. |

## Documentación oficial consultada

- [Instalar y ejecutar Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).
- [Conexiones, Session pooler y TLS](https://supabase.com/docs/guides/database/connecting-to-postgres).
- [Migraciones y despliegue](https://supabase.com/docs/guides/deployment/database-migrations).
