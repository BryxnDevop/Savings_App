# Notificaciones Push en Ahorra+

La aplicación incluye **Web Push real** para que los avisos aparezcan como notificaciones del sistema aunque Ahorra+ no esté abierta. Se usan el Service Worker de la PWA, claves VAPID y el servicio push del navegador; no depende de mantener una pestaña abierta.

## Qué puede notificar

- Cada movimiento nuevo registrado manualmente.
- Movimientos detectados desde el banco/correo cuando la automatización está activa.
- Pagos recurrentes próximos, registrados, omitidos o que requieren revisión.
- Presupuesto al llegar al 80% de uso y cuando el saldo disponible queda cerca del 10%.
- Metas cuando están cerca de completarse y cuando se completan.

Cada categoría se puede activar o desactivar desde **Ajustes → Notificaciones push**.

## 1. Aplicar la migración de Supabase

Antes de desplegar el código:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

La migración `20260919000000_web_push.sql` crea las suscripciones, preferencias y estado de entrega de las notificaciones.

## 2. Generar las claves VAPID una sola vez

```bash
npm run push:keys
```

Guarda el resultado como secretos de Vercel. **No regeneres estas claves en cada despliegue**, porque las suscripciones existentes dependen de ellas.

Variables necesarias en producción:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=https://tu-dominio.vercel.app
CRON_SECRET=un-secreto-largo-y-aleatorio
```

Conserva también las variables que ya usa la aplicación (`DATABASE_URL`, `DB_SSL_CA_CERT`, `APP_ORIGIN`, `APP_TIME_ZONE`, etc.).

## 3. Desplegar en Vercel

Vercel ejecuta `npm run build` y publica la PWA. Los movimientos manuales, alertas de presupuesto y cambios de meta intentan enviar el push inmediatamente después de guardarse.

Para banco y pagos automáticos con la app cerrada, `/api/jobs` debe ejecutarse periódicamente. El proyecto incluye:

- Un Cron diario de Vercel como respaldo.
- `supabase/cron/activar.sql`, que llama `/api/jobs` cada 5 minutos. Cada buzón Gmail mantiene su propia revisión horaria.

Para recibir avisos bancarios sin abrir Ahorra+, configura el Cron de Supabase siguiendo `docs/VERCEL.md`.

## 4. Activar Push en un dispositivo

1. Inicia sesión.
2. Abre **Ajustes → Notificaciones push**.
3. Pulsa **Activar notificaciones**.
4. Acepta el permiso del navegador.
5. Deja activadas las categorías que quieras recibir.

Cada navegador o teléfono debe activarse una vez por separado.

## 5. Probarlo con la app cerrada

La opción **Probar push real con la app cerrada** ya no genera una notificación local. Hace una petición al servidor y el servidor espera unos 8 segundos antes de mandar un Web Push real.

Prueba recomendada:

1. Pulsa **Probar push real con la app cerrada**.
2. Inmediatamente minimiza Ahorra+, cambia a otra app o bloquea la pantalla.
3. Aproximadamente 8 segundos después debe aparecer una notificación de **Ahorra+**.
4. Tócala: debe abrir Ahorra+ y llevarte a Ajustes.

Si tienes Ahorra+ activado en varios dispositivos con la misma cuenta, la prueba se envía a todos los dispositivos suscritos.

## 6. Prueba de un movimiento real

Con Push activado:

1. Cierra o minimiza Ahorra+ en el teléfono.
2. Desde otro dispositivo con la misma cuenta, registra una entrada o salida.
3. El servidor genera `movement_new` y lo despacha al dispositivo suscrito.
4. Debe aparecer el importe, moneda y motivo del movimiento.

Para probar movimientos bancarios automáticos, deja Gmail conectado y el Cron de Supabase activo; cuando el lector registre un movimiento, se genera el aviso de banco y el aviso del movimiento.

## Compatibilidad y sonido

Web Push requiere HTTPS en producción. En iPhone/iPad conviene instalar Ahorra+ en la pantalla de inicio antes de activar las notificaciones. El sonido y la vibración finales los controla el sistema operativo; la Web Push API no permite imponer de forma consistente un tono personalizado como el de WhatsApp.
