# Ahorra+ 4.2 · React, Supabase, Vercel y PWA

La base de datos se aloja en **tu proyecto Supabase**. Ya no hace falta iniciar un contenedor PostgreSQL para utilizar la app. Se mantienen el servidor Node, las cuentas actuales, el registro mensual, Gmail y los pagos recurrentes; esta edición añade **Web Push real** para pagos próximos, presupuesto, movimientos, metas y avisos bancarios, además de una prueba enviada desde el servidor para verificar que funciona con la app cerrada.

**Si ya usabas Ahorra+**, lee primero [Trasladar tus datos](docs/SUPABASE.md#trasladar-tus-datos-desde-ahorra-32). Conectar a una base vacía no copia los datos anteriores automáticamente.

## Desplegar en Vercel

Sigue **[docs/VERCEL.md](docs/VERCEL.md)**. Incluye la función `api/index.js`, las rutas, variables de entorno y el programador de revisiones. Selecciona como Root Directory la carpeta `ahorra-plus` que contiene `vercel.json`. Publicar solo `dist/` no incluye el backend.

La pantalla de entrada y el login usan tema blanco/claro. Crear una cuenta regresa al login sin iniciar sesión; el usuario debe escribir su contraseña para acceder al dashboard. El modo oscuro permanece disponible dentro de la cuenta.

## Preparación rápida en Windows

Instala Node.js 24 LTS. Abre PowerShell en esta carpeta:

```powershell
npm ci
npm run setup
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Crea un proyecto en Supabase si todavía no tienes uno. Sustituye `TU_PROJECT_REF` por el identificador real. La carpeta `supabase/` y la migración ya están preparadas: **no necesitas ejecutar `supabase init`**. La CLI está fijada como dependencia de desarrollo; no la instales globalmente con npm.

En Supabase abre **Connect → Session pooler → URI**. Copia esa cadena en `DATABASE_URL` dentro de `.env`, sustituyendo el marcador por la **contraseña de la base**. El usuario, host y puerto deben ser exactamente los del panel. Guarda el archivo y ejecuta:

```powershell
npm run db:check
npm start
```

Para probar esta versión localmente ejecuta `npm run build` antes de `npm start`, porque el Service Worker y la interfaz Push se generan durante la compilación. `INICIAR-WINDOWS.bat` y `INICIAR-MAC-LINUX.command` ya hacen ese build automáticamente. Mantén el proceso en ejecución.

**Guía completa y solución de errores:** [docs/SUPABASE.md](docs/SUPABASE.md). Incluye TLS, migración de tus registros, Docker opcional, Supabase local y respaldos completos.

## Cambiar moneda desde tu foto

Pulsa tu foto → **Cambiar moneda**. Selecciona USD, DOP, EUR, MXN o COP, revisa la conversión y pulsa **Confirmar conversión**. Se actualizan saldo, historial y meta; cada movimiento mantiene su moneda e importe originales. También sigue disponible en Ajustes. Por ejemplo, con una tasa manual de 59.10 DOP/USD, 150 USD se muestran como RD$8,865; esa tasa es un ejemplo, no una cotización actual.

El panel se cierra antes de abrir el conversor para evitar ventanas superpuestas en móvil. Conserva idioma, apariencia clara/oscura, nombre, foto y configuración Gmail.

## Datos, login y funcionamiento automático

Los datos se guardan en el esquema privado `ahorra` de Supabase y están asociados a cada cuenta. La aplicación no borra movimientos cada 24 horas. Borrar el navegador o el acceso directo no elimina los registros de la base.

Supabase usa PostgreSQL internamente; ahora lo administra Supabase. La app sigue utilizando **su propio login con contraseñas scrypt y sesiones**, conservando las cuentas al importar el respaldo completo. Esta edición no utiliza Supabase Auth. No necesitas claves `anon`, `service_role` ni variables `VITE_SUPABASE_*`.

En ejecución local, Gmail se revisa aproximadamente cada hora y los pagos recurrentes cada minuto desde el servidor Node. En Vercel usa el programador descrito en docs/VERCEL.md. **El servidor debe estar encendido y conectado a Supabase** aunque cierres la PWA. En esta modalidad local, Supabase por sí solo no ejecuta estos trabajadores. Para funcionar 24/7, aloja también el servidor en un servicio que mantenga procesos activos.

Consulta [docs/FUNCIONES.md](docs/FUNCIONES.md) para Gmail, pagos recurrentes, notificaciones, monedas, idioma y perfil. Para Web Push, genera las claves con `npm run push:keys`, aplica `npx supabase db push` y copia las variables VAPID al panel de Vercel como explica [docs/VERCEL.md](docs/VERCEL.md).

## PWA y teléfono

En Chrome o Edge abre http://localhost:4173 y usa **Instalar aplicación** en la barra de direcciones o el menú. En el teléfono usa la dirección HTTPS donde alojes el servidor y **Añadir a pantalla de inicio**.

La interfaz puede guardarse en caché, pero iniciar sesión, consultar registros y guardar cambios requiere conexión al servidor y a Supabase. El acceso directo no inicia Node. `localhost` desde el teléfono es el teléfono, no tu PC. Para varios dispositivos necesitas alojar el backend con HTTPS y configurar `APP_ORIGIN` con su dirección pública exacta; el proxy debe conservar el encabezado Host. No basta con publicar solo `dist/` en un alojamiento estático.

## Desarrollo y pruebas

```powershell
npm run build
npm test
npm run test:embedded
```

Para desarrollar, inicia `npm start` con Supabase configurado y, en otra terminal, `npm run dev`. Abre http://127.0.0.1:5173. Vite dirige `/api` al servidor de 4173.

La suite SQL usa PGlite. `npm run test:db` permite probar el controlador `pg` con `TEST_DATABASE_URL` en una base de pruebas desechable y vacía; **no uses tu base real**, pues esa suite aplica migraciones y escribe datos de prueba.

[Validación y límites](docs/VALIDACION.md). La conexión con tu proyecto remoto requiere completar la configuración: no se han proporcionado credenciales ni se ha desplegado esta entrega en tu Supabase.
