# Notificaciones Push en Ahorra+

La aplicacion incluye Web Push real para pagos recurrentes, presupuesto, movimientos, metas y movimientos bancarios.

## 1. Aplicar la migracion de Supabase

Antes de desplegar el codigo nuevo:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

La migracion `20260919000000_web_push.sql` crea las tablas de suscripciones/preferencias y actualiza `ahorra.schema_version` a 2.

## 2. Generar las claves VAPID una sola vez

```bash
npm run push:keys
```

Guarda el resultado como secretos de Vercel. No regeneres estas claves en cada despliegue, porque las suscripciones existentes dependen de ellas.

Variables de produccion:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=https://tu-dominio.vercel.app
CRON_SECRET=un-secreto-largo-y-aleatorio
```

Conserva tambien las variables que ya usa la aplicacion (`DATABASE_URL`, `DB_SSL_CA_CERT`, `APP_ORIGIN`, `APP_TIME_ZONE`, etc.).

## 3. Desplegar en Vercel

Vercel ejecuta `npm run build` y publica la app. El archivo `vercel.json` incluye un Cron diario a las 12:00 UTC (08:00 America/Santo_Domingo) como respaldo para crear y enviar avisos aunque la app no este abierta.

Si ya usas el Cron de Supabase que llama a `/api/jobs`, puedes conservarlo para revisiones mas frecuentes. `/api/jobs` esta protegido por `CRON_SECRET`.

## 4. Activar Push en un dispositivo

Inicia sesion y abre:

**Ajustes -> Notificaciones push**

Pulsa **Activar en este dispositivo**, concede el permiso del navegador y usa **Probar notificacion** para verificar la entrega.

Cada navegador/dispositivo necesita su propia suscripcion.

## Avisos incluidos

- Pago recurrente: desde 2 dias antes del vencimiento, ademas del dia anterior y el mismo dia.
- Presupuesto: al alcanzar 80% de uso y al quedar aproximadamente 10% o menos.
- Movimientos: aviso por nuevos ingresos y gastos registrados.
- Metas: mensaje motivacional al acercarse a la meta y aviso al completarla.
- Banco: aviso cuando el lector de correo registra un movimiento bancario.

El usuario puede activar o desactivar cada categoria desde Ajustes.

## Sonido

Las notificaciones solicitan sonido y vibracion del sistema cuando el usuario deja activada la opcion de sonido. Los navegadores y sistemas operativos controlan el tono final; Web Push no permite fijar de forma consistente un archivo de audio personalizado en todas las plataformas.
