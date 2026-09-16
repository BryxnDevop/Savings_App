# Ahorra+ 3.1 · React, PostgreSQL y PWA

Una app de ahorros con cuentas personales, registros por mes y quincena, conversión de monedas, conexión Gmail, perfil e interfaz en español e inglés. Incluye modo claro/oscuro y una vista móvil renovada.

## Inicio recomendado: Docker

Necesitas **Node.js 22.12 o superior** y **Docker Desktop abierto** (o Docker Engine con Docker Compose v2 en Linux).

1. Descomprime todo el ZIP.
2. Abre una terminal en la carpeta `ahorra-plus`.
3. Ejecuta:

```bash
node scripts/configure.mjs
docker compose up -d --build --wait
```

4. Abre **http://localhost:4173**.
5. Pulsa **Crear una cuenta**, introduce tu nombre, correo y una contraseña de al menos 10 caracteres.

La primera ejecución descarga las imágenes, instala las dependencias y compila React; puede tardar unos minutos. El servidor crea las tablas automáticamente. No necesitas crear tablas a mano ni comprar una base de datos alojada.

**Windows:** también puedes abrir `INICIAR-WINDOWS.bat` después de instalar Node.js y abrir Docker Desktop. **Mac/Linux:** ejecuta `sh INICIAR-MAC-LINUX.command`.

El script `configure.mjs` genera una contraseña aleatoria para PostgreSQL y escribe la configuración en `.env`. Si ya existe, conserva su configuración y añade únicamente la clave de cifrado de Gmail si falta. La contraseña de PostgreSQL es diferente de la contraseña de tu cuenta de Ahorra+.

Para las siguientes aperturas:

```bash
docker compose up -d --wait
```

Para detener los servicios conservando la base:

```bash
docker compose stop
```

## Actualizar desde la versión 3.0 sin perder tus datos

1. Exporta un respaldo desde Ajustes y, preferiblemente, una copia completa de PostgreSQL siguiendo las instrucciones de este documento.
2. Detén la app con `docker compose stop`. Conserva tu archivo de configuración `.env` y el volumen `ahorra-plus_postgres_data`.
3. Reemplaza los archivos de la carpeta `ahorra-plus` por los de este paquete, en la misma ubicación. No borres `.env` ni el volumen. El ZIP no incluye contraseñas ni reemplaza tu configuración.
4. Con Docker Desktop abierto y su motor Linux listo, ejecuta:

```bash
node scripts/configure.mjs
docker compose up -d --build --wait
```

La base recibe las tablas nuevas automáticamente; las cuentas y movimientos existentes se conservan. Si la PWA ofrece **Actualizar aplicación**, acepta la actualización cuando no estés editando datos.

Si PowerShell muestra `dockerDesktopLinuxEngine ... The system cannot find the file specified`, abre Docker Desktop, espera a que el motor esté listo y comprueba `docker info` antes de repetir el comando. Los iniciadores incluidos comprueban ahora que el motor responda.

## Gmail: revisión bancaria cada hora

Abre **tu foto → Correo bancario**, o entra en **Ajustes**.

1. Activa la verificación en dos pasos de Google y crea una contraseña de aplicación en https://myaccount.google.com/apppasswords. Algunas cuentas de organización o de Protección Avanzada no permiten esta opción. Esta edición usa IMAP con contraseña de aplicación; no incluye OAuth ni Outlook.
2. Introduce tu dirección de Gmail y esa contraseña de aplicación **dentro de Ahorra+**. No uses la contraseña habitual de Google ni envíes credenciales por chat.
3. Añade las direcciones exactas desde las que tu banco manda alertas. El nombre visible del remitente no es suficiente.
4. Ajusta las etiquetas al texto real del aviso: etiqueta del importe, palabra de gasto, palabra de entrada, etiqueta de referencia y separador decimal.
5. Usa **Probar con el texto de un aviso** con un texto sin información privada. Comprueba tipo, importe y moneda. El texto de prueba no se guarda ni modifica el saldo. La prueba no puede verificar la firma del remitente.
6. Autoriza la lectura y conecta Gmail. Por defecto los avisos quedan pendientes; activa **Registrar automáticamente** y guarda las reglas cuando hayas comprobado el formato.

Ejemplo compatible con las reglas iniciales:

```text
Consumo aprobado
Monto: DOP 1,250.00
Referencia: ABC12345
```

Para una entrada, la palabra inicial es `Depósito`; debe indicar que fue confirmado, realizado o equivalente. Cambia las palabras configuradas si tu banco usa otras etiquetas. No se usa IA externa ni se envían tus correos a un modelo.

### Qué se aplica y qué queda pendiente

- El primer enlace fija un punto de inicio: **no descuenta compras antiguas**. Se buscan mensajes nuevos, leídos o sin leer, en Todos los mensajes de Gmail; si esa carpeta no está disponible se usa INBOX. Papelera y spam no se revisan.
- El servidor consulta cada hora. El navegador puede estar cerrado; el ordenador/servidor, PostgreSQL e internet deben seguir encendidos. Si estuvo apagado, al volver a iniciar recupera los mensajes posteriores al último punto procesado que aún estén en el buzón. La hora corresponde a una frecuencia aproximada, no a alertas instantáneas.
- Puedes pulsar **Revisar ahora** (máximo una vez por minuto), pausar la revisión o desconectar Gmail.
- Solo se registra automáticamente un aviso con remitente exacto autorizado, autenticación DKIM/DMARC de Gmail alineada con ese remitente, un tipo inequívoco, importe con moneda explícita, confirmación de éxito y referencia bancaria única.
- Formatos monetarios admitidos: USD, DOP, RD$, US$, EUR, €, MXN y COP, con dos decimales y el separador configurado. Un `$` sin moneda, múltiples importes con la misma etiqueta o un formato diferente quedan pendientes. El correo debe contener el texto del aviso; no se extraen importes de imágenes, PDF ni adjuntos.
- Se bloquean avisos de rechazo, reverso, reembolso, solicitud o pendiente. Las notificaciones con texto que no permita una interpretación segura quedan para revisión. No se afirma compatibilidad universal con todos los bancos: prueba primero un aviso real de tu banco.
- Las compras de tarjeta se registran como gastos de tu presupuesto. No es una conexión directa al saldo del banco ni un sistema de conciliación de tarjetas/créditos; revisa que pagos de tarjeta, transferencias propias y avisos distintos no dupliquen el mismo hecho económico.
- Se deduplica por identificador del mensaje de Gmail y por referencia bancaria. Si ya hay un movimiento del mismo importe, moneda, tipo y día, queda pendiente por posible duplicado. Las referencias repetidas nunca se aplican dos veces, incluso si borraste el movimiento del historial.
- Los casos pendientes con importe interpretable permiten **Revisar y registrar**, con confirmación. Los demás se pueden omitir y registrar manualmente desde Movimientos. Cambiar las reglas no vuelve a interpretar automáticamente los avisos anteriores.
- Se usa la fecha de recepción en UTC; puedes corregirla en Movimientos cuando la fecha efectiva del banco sea diferente. La moneda original se conserva y el saldo se presenta con tus tasas guardadas.
- La actividad muestra hasta 100 avisos, priorizando los pendientes. Los contadores incluyen todo el historial. Las actualizaciones del saldo se consultan cada minuto y al volver a enfocar la app; un formulario abierto mantiene la protección contra cambios simultáneos.

### Privacidad y claves

La app usa IMAP con TLS, abre el buzón en modo de solo lectura y no envía, modifica ni elimina mensajes. La contraseña de aplicación permite un acceso más amplio a la cuenta de correo a nivel de Google; el programa limita su uso a estas lecturas. Puedes revocarla desde Google. Al cambiar tu contraseña de Google, puede ser necesario crear una nueva contraseña de aplicación y reconectar.

La contraseña se guarda cifrada con AES-256-GCM en PostgreSQL. `node scripts/configure.mjs` genera `MAIL_ENCRYPTION_KEY` en el servidor. **Conserva esa clave con tu configuración y tus respaldos, sin publicarla**: perderla obliga a reconectar Gmail. No se devuelve la contraseña a la interfaz. Se guarda el asunto, remitente, fecha, movimiento interpretado y estado; no el cuerpo completo ni los adjuntos. Los logs no incluyen credenciales ni cuerpos de correo.

Desconectar elimina la credencial guardada y detiene nuevas lecturas; conserva los movimientos y el historial de avisos. Al reconectar se establece un nuevo punto de inicio. Las copias JSON financieras no incluyen claves, conexiones ni el historial de deduplicación: para respaldar todo usa la copia completa de PostgreSQL y conserva la configuración por separado.

## Panel de cuenta, modo oscuro y móvil

- Pulsa tu foto/inicial en la esquina superior para abrir el panel deslizante. Incluye nombre, foto, idioma, apariencia, contraseña, enlace a correo bancario y cierre de sesión.
- En **Apariencia** elige **Claro**, **Oscuro** o **Sistema**. Se recuerda en ese navegador/dispositivo y también se aplica al inicio de sesión.
- El escritorio mantiene su composición. Hasta 600 px se usa navegación inferior flotante, botón Registrar, campos cómodos para tocar y formularios tipo panel inferior. Respeta la preferencia de movimiento reducido.
- `localhost` en tu teléfono apunta al propio teléfono, no a tu PC. Para acceder desde otro dispositivo necesitas una dirección de servidor accesible y HTTPS; consulta la sección de despliegue. El Compose inicial sigue limitado al ordenador local. Cambiar el tamaño del navegador permite probar la vista móvil en tu PC.

## Dónde se guardan los datos

**En PostgreSQL.** Cada cuenta tiene sus propios movimientos, moneda de visualización, tasas, meta, idioma, nombre y foto. El servidor identifica al usuario por su sesión y limita todas las consultas a su cuenta.

Con Docker, los datos están en el volumen persistente **`ahorra-plus_postgres_data`**, montado dentro de PostgreSQL en `/var/lib/postgresql/data`. En Docker Desktop puedes verlo en **Volumes**.

- Los registros no tienen caducidad de 24 horas.
- Cerrar la app, cerrar sesión, reiniciar la computadora o recrear el contenedor no elimina el volumen.
- Borrar los datos del navegador no elimina los registros de PostgreSQL. Vuelve a iniciar sesión.
- La sesión caduca a los 30 días; esto cierra el acceso, pero no borra los datos.
- `docker compose down` conserva el volumen. **No uses `docker compose down -v` si quieres conservar tus datos:** esa opción elimina el volumen.
- La pérdida o borrado del volumen/disco requiere un respaldo para recuperar la información.

La app utiliza una cookie de sesión `HttpOnly`, `SameSite=Strict` y `Secure` cuando se configura HTTPS. Las contraseñas de las cuentas se almacenan con scrypt y sal aleatoria. Los tokens de sesión se almacenan como hashes. Las credenciales de PostgreSQL permanecen en el servidor; no se incluyen en el JavaScript enviado al navegador.

No hay verificación de correo ni recuperación automática por email en esta versión. Puedes cambiar tu contraseña desde Ajustes con la contraseña actual.

## Funciones nuevas

### Inicio de sesión y perfil

- Crear cuenta, iniciar sesión y cerrar sesión.
- Registros aislados por usuario, incluso si dos usuarios usan el mismo ID de movimiento.
- **Ajustes → Mi cuenta:** cambiar nombre y foto de perfil.
- Fotos PNG, JPG o WebP de hasta 5 MB. La app recorta y reduce la imagen a 256 × 256, la convierte en JPEG y guarda la foto en PostgreSQL.
- **Ajustes → Acceso a tu cuenta:** cambiar contraseña; las otras sesiones de esa cuenta se invalidan.

### Registro mensual por quincenas

En **Registro mensual**, selecciona el año y después el mes. Cada mes muestra:

- **Primera quincena:** del día 1 al 15, ambos incluidos.
- **Segunda quincena:** del 16 al último día del mes.
- Entradas, gastos, balance de cada quincena y sus movimientos.

Abril termina el 30. Enero incluye el 31. Febrero incluye el 28 o 29 según el año. Los meses sin registros muestran un estado vacío, sin cifras inventadas. Los totales usan la moneda de visualización y las tasas de tu cuenta.

### Conversión real de monedas

En **Ajustes → Idioma y moneda → Cambiar moneda y tasas**:

1. Elige USD, DOP, EUR, MXN o COP.
2. Revisa las tasas y la vista previa del saldo.
3. Pulsa **Confirmar conversión**.

El saldo, la meta y el historial se recalculan. **150 USD con una tasa de 59.10 DOP por USD se muestran como 8,865 DOP.** Si usas otra tasa, el resultado cambia.

Cada movimiento conserva su **importe y moneda originales**. Por ejemplo, un movimiento registrado como 150 USD sigue guardado así aunque lo consultes en DOP. Al volver a USD no se convierte otra vez el valor ya redondeado. Esto evita acumular errores por cambiar de moneda varias veces.

Al editar un movimiento se muestran su importe y moneda originales. Puedes registrar movimientos en monedas diferentes; la vista general los convierte a la moneda seleccionada. Los importes se guardan en centavos enteros y la conversión usa aritmética entera con tasas de hasta seis decimales.

### Tasas: manuales o consultadas en línea

Las tasas iniciales son **ejemplos manuales editables**, claramente identificados:

| Moneda | Unidades por 1 USD de ejemplo |
| --- | ---: |
| USD | 1 |
| DOP | 59.10 |
| EUR | 0.92 |
| MXN | 18.50 |
| COP | 4000 |

**No se presentan como cotizaciones actuales.** Para consultar cotizaciones de referencia, pulsa **Obtener tasas actuales**. El servidor solicita las tasas a ExchangeRate-API, muestra su fecha y las deja como vista previa. Solo se aplican al confirmar.

La fuente gratuita actualiza sus datos diariamente. El servidor conserva una copia de la consulta durante una hora para evitar peticiones repetidas. Si el servicio no está disponible, tus tasas guardadas se conservan y puedes introducirlas manualmente. Las tasas bancarias o de una operación concreta pueden ser diferentes. La aplicación calcula equivalencias; no compra ni transfiere divisas.

Las tasas se aplican a la valoración actual del historial; no representan cotizaciones históricas de cada fecha. [Documentación de ExchangeRate-API](https://www.exchangerate-api.com/docs/free).

### Español e inglés

Cambia **Ajustes → Idioma de la aplicación** entre Español y English. La preferencia se guarda en tu cuenta. Se traducen la navegación, los formularios, el registro mensual, el gráfico, los mensajes, las fechas y el formato monetario. Los motivos, notas y nombres que escribes se conservan como los registraste.

## Migrar tus datos anteriores

1. En la app anterior, exporta tu respaldo JSON desde el navegador donde tenías los movimientos.
2. Inicia sesión en la nueva app.
3. Abre **Ajustes → Importar respaldo**, selecciona el archivo, revisa el resumen y confirma.

Se admiten respaldos del HTML original, de React v2 y de la nueva v3. Se conservan los registros existentes, se agregan los nuevos y se omiten duplicados idénticos. Si un ID existe con datos diferentes, se rechaza la importación para que revises el conflicto.

Si la versión anterior estaba en el mismo origen (`http://localhost:4173`) y navegador, aparece **Migrar datos de este navegador**. Esta opción prepara la importación en tu cuenta actual y pide confirmación; no borra los datos antiguos del navegador.

Los JSON originales que solo contienen una lista de movimientos no indican moneda. Antes de importarlos, selecciona la moneda en la que estaban registrados. Los respaldos v2 y v3 sí incluyen moneda.

## PWA y acceso directo

1. Con los servicios encendidos, abre **http://localhost:4173** en Chrome o Edge.
2. Inicia sesión y entra en Ajustes.
3. Pulsa **Instalar aplicación** o usa el icono de instalación junto a la dirección.
4. Crea o ancla el acceso directo cuando el navegador/sistema lo ofrezca.

La PWA abre en su propia ventana. Los archivos de la interfaz, la fuente y los iconos se almacenan en caché. **Iniciar sesión, cargar registros y guardar cambios requiere conexión con tu servidor.** Con el servidor en tu computadora no necesitas internet para registrar movimientos; sí necesitas que Docker/PostgreSQL estén encendidos. Consultar tasas nuevas sí requiere internet.

La app no guarda nuevos registros financieros en `localStorage`, no almacena respuestas de `/api/` en la caché PWA y no mantiene una cola de escrituras pendientes. Si se pierde la conexión mientras está abierta, puede seguir mostrando la vista ya cargada, pero informa que los cambios no están confirmados. Al recargar o abrirla desde cero necesita el servidor para autenticar y consultar los datos.

No abras `index.html` con doble clic. La instalación requiere localhost o HTTPS. Si ya tenías instalada Ahorra+ v2, abre la app con el nuevo servidor funcionando y aplica **Actualizar aplicación** cuando aparezca el aviso.

## Ejecutar con un PostgreSQL existente

Si ya tienes PostgreSQL 17 o superior, crea una base vacía y un usuario con permisos para crear tablas en ella. Luego:

1. Copia `.env.example` como `.env`.
2. Configura `DATABASE_URL` con tu usuario, contraseña, servidor, puerto y base de datos. Si la contraseña incluye caracteres especiales, codifícalos para una URL.
3. En `ahorra-plus`, ejecuta:

```bash
npm ci --omit=dev
npm start
```

La entrega incluye `dist/` compilado. Abre **http://localhost:4173**. El arranque aplica `server/schema.sql` de forma idempotente.

Ejemplo de estructura de la conexión (sustituye los valores):

```dotenv
DATABASE_URL=postgresql://usuario:contrasena@127.0.0.1:5432/ahorra_plus
APP_ORIGIN=http://localhost:4173
PORT=4173
```

Para una base remota, utiliza la configuración TLS requerida por tu proveedor, por ejemplo parámetros SSL en `DATABASE_URL` y su certificado de confianza cuando corresponda. No pongas esta conexión en variables `VITE_*`, porque esas variables pueden llegar al navegador.

## Respaldos

**Por cuenta:** Ajustes → Exportar respaldo descarga un JSON de movimientos, monedas, tasas y meta. Sirve para restaurar esos registros. El JSON financiero no contiene contraseñas ni sesiones, y no es un respaldo de todos los perfiles.

**Base completa con Docker:** el siguiente ejemplo incluye usuarios, perfiles y registros. Los nombres corresponden a la configuración generada por defecto:

```bash
docker compose exec -T db pg_dump -U ahorra -d ahorra_plus -Fc -f /tmp/ahorra-backup.dump
docker compose cp db:/tmp/ahorra-backup.dump ./ahorra-backup.dump
```

Conserva esa copia en un lugar privado. Para restaurarla en una base de destino preparada, copia el archivo al contenedor y usa `pg_restore`; la opción `--clean` reemplaza las tablas existentes, por lo que debes respaldar el destino antes:

```bash
docker compose cp ./ahorra-backup.dump db:/tmp/ahorra-backup.dump
docker compose exec -T db pg_restore -U ahorra -d ahorra_plus --clean --if-exists /tmp/ahorra-backup.dump
```

El frontend sigue ofreciendo CSV para consultar resultados filtrados en una hoja de cálculo. La restauración desde la app usa JSON.

## Desarrollo

Con un PostgreSQL accesible por `DATABASE_URL`:

```bash
npm ci
npm start
```

En otra terminal:

```bash
npm run dev
```

Abre `http://localhost:5173`. Vite redirige `/api/` al backend de `127.0.0.1:4173`. Para desarrollo local, usa `NODE_ENV` distinto de `production`. La PWA se prueba en la versión compilada de `npm start`.

Para reconstruir:

```bash
npm run build
```

Con Docker:

```bash
docker compose up -d --build --wait
```

El volumen de PostgreSQL se conserva. La app muestra un aviso cuando hay una nueva versión PWA.

## Usarla en otros dispositivos

La configuración incluida publica la app solo en `127.0.0.1:4173` de tu computadora y no publica el puerto de PostgreSQL. Para acceder desde otros dispositivos necesitas alojar el backend y la base de datos en un servidor accesible, servir la app mediante HTTPS y configurar `APP_ORIGIN` con la dirección pública exacta. El proxy HTTPS debe conservar el encabezado Host. Los usuarios verán los mismos registros al iniciar sesión en el mismo servidor con la misma cuenta.

Publicar solo `dist/` en un alojamiento estático no es suficiente: esta versión necesita la API Node y PostgreSQL.

## Pruebas

```bash
npm ci
npm run build
npm test
npm run test:embedded
```

La suite usa PostgreSQL compilado a WebAssembly mediante PGlite para validar SQL, transacciones, persistencia y flujos de la API. La app de producción usa el controlador `pg` y PostgreSQL normal.

Para ejecutar la integración contra un servidor PostgreSQL de pruebas, define `TEST_DATABASE_URL` y ejecuta:

```bash
npm run test:db
```

Usa una base de pruebas dedicada. La suite crea cuentas con identificadores aleatorios y elimina sus registros al terminar. Consulta **`docs/VALIDACION.md`** para conocer lo comprobado y las limitaciones del entorno.

## Estructura

- `src/App.jsx`: aplicación React y estado confirmado por la API.
- `src/components/`: acceso, formularios, perfil, gráfico, registro por quincenas y conversión.
- `src/lib/ledger.js`: monedas originales, conversión exacta, respaldos y quincenas.
- `src/lib/i18n.jsx`: idioma, formatos y mensajes.
- `server/schema.sql`: usuarios, carteras, movimientos, sesiones y caché de tasas.
- `server/db.mjs`: consultas parametrizadas y transacciones con revisión optimista.
- `server/auth.mjs`: contraseñas, cookies y sesiones.
- `server/api.mjs`: rutas protegidas, perfil, registros y cotizaciones.
- `scripts/serve.mjs`: API y frontend en el mismo servidor.
- `compose.yaml`: PostgreSQL con volumen persistente y app.
- `Dockerfile`: compilación React e imagen del servidor.
- `dist/`: frontend PWA compilado.

El archivo ZIP también conserva el HTML original en `version-original/`.

Referencias: [node-postgres](https://node-postgres.com/features/queries), [imagen oficial de PostgreSQL](https://hub.docker.com/_/postgres/), [ExchangeRate-API](https://www.exchangerate-api.com/docs/free), [instalación de PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
