# Uso de Ahorra+ 4.1

> En Vercel, las revisiones automáticas requieren configurar el programador de `VERCEL.md`. Las frecuencias siguientes describen el servidor Node local.

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
- El servidor consulta cada hora. El navegador puede estar cerrado; el servidor debe seguir encendido y conectado a Supabase por internet. Si estuvo apagado, al volver a iniciar recupera los mensajes posteriores al último punto procesado que aún estén en el buzón. La hora corresponde a una frecuencia aproximada, no a alertas instantáneas.
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

La contraseña se guarda cifrada con AES-256-GCM en Supabase. `node scripts/configure.mjs` genera `MAIL_ENCRYPTION_KEY` en el servidor. **Conserva esa clave con tu configuración y tus respaldos, sin publicarla**: perderla obliga a reconectar Gmail. No se devuelve la contraseña a la interfaz. Se guarda el asunto, remitente, fecha, movimiento interpretado y estado; no el cuerpo completo ni los adjuntos. Los logs no incluyen credenciales ni cuerpos de correo.

Desconectar elimina la credencial guardada y detiene nuevas lecturas; conserva los movimientos y el historial de avisos. Al reconectar se establece un nuevo punto de inicio. Las copias JSON financieras no incluyen claves, conexiones ni el historial de deduplicación: para respaldar todo usa `npm run db:export -- --file backups/copia.json` y conserva la configuración por separado.

## Gastos recurrentes y próximos pagos

Abre **Pagos fijos → Nuevo pago recurrente**. Indica nombre, importe, moneda, categoría, frecuencia (mensual, semanal o anual) y próxima fecha. Puedes crear Netflix por RD$600, internet por RD$2,500, alquiler por RD$25,000, seguro por RD$4,000 o cualquier otro pago. Los ejemplos no se crean solos: tú eliges los importes y fechas reales.

- En el vencimiento, el servidor genera un **gasto** y actualiza tu saldo. La revisión se ejecuta al arrancar y aproximadamente cada minuto. No realiza un cargo ni una transferencia en tu banco; registra el gasto en Ahorra+.
- El calendario usa **America/Santo_Domingo**, visible en la pantalla. Puedes cambiar `APP_TIME_ZONE` en la configuración del servidor y reiniciar. Se conserva la moneda original y se aplican tus tasas al mostrar el saldo.
- El primer pago puede ser hoy o una fecha futura. Si seleccionas hoy, confirma que ese gasto no esté ya registrado: se generará en la siguiente revisión.
- Los pagos del día 31 se ajustan al último día de un mes más corto y vuelven al 31 en el siguiente mes que lo permita. Los pagos anuales del 29 de febrero usan el 28 en años no bisiestos.
- Con el navegador cerrado se siguen generando pagos mientras **el servidor esté encendido y conectado a Supabase**. Si el servidor se apaga, al iniciar recupera todos los vencimientos pendientes por lotes; no inventa pagos anteriores a la fecha inicial.
- El movimiento, su vencimiento procesado y el avance de la programación se guardan juntos en una transacción. Reiniciar o tener dos procesos no vuelve a descontar la misma fecha. Si borras un movimiento generado, su vencimiento no se vuelve a generar.
- Si ya existe un gasto del mismo importe, moneda y día, el pago queda **Por revisar** sin otro descuento. Puedes **Omitir este vencimiento** o confirmar **Registrar de todos modos** si realmente es otro gasto. Esto también reduce duplicados con avisos de Gmail; no es una conciliación bancaria completa y no identifica coincidencias con fechas o importes distintos.
- **Editar** cambia los vencimientos aún no registrados. **Pausar** suspende nuevas entradas; al **Reactivar** se omiten las fechas que transcurrieron en pausa. **Eliminar** archiva la programación y conserva el historial de gastos.
- Un saldo insuficiente no impide registrar el gasto: puede quedar negativo, como en los registros manuales. La alerta de saldo bajo se mostrará si había entradas registradas.
- El máximo es de 100 programaciones por cuenta. Los casos que superen los límites del historial o de importes quedan para revisar.

En **Resumen → Próximos pagos** aparecen los cuatro pagos activos más cercanos: rojo para hoy/mañana o atrasados, amarillo para los siguientes siete días y verde para fechas posteriores. La lista completa está en Pagos fijos. Si la app estuvo suspendida, vuelve a enfocarla o actualiza para refrescar fechas y saldo.

## Notificaciones

La campana del encabezado abre el centro de notificaciones. Los avisos se guardan en Supabase por cuenta, incluyen contador de no leídos y permiten marcar uno o todos como leídos. La lista muestra hasta 100, priorizando los no leídos.

| Aviso | Regla |
|---|---|
| Presupuesto utilizado | Al gastar el 80% o más del **total de entradas registradas**, convertido a tu moneda de visualización. No se calcula sobre un presupuesto mensual separado. |
| Saldo bajo | Si hubo entradas y queda el 10% o menos de ellas, incluido saldo cero o negativo. Con RD$5,000 de entradas y RD$4,800 de gastos, muestra los RD$200 restantes. |
| Meta cercana | Cuando falta el 20% o menos del objetivo. Por ejemplo, Laptop de RD$40,000 con saldo RD$32,000: faltan RD$8,000. |
| Meta completada | Cuando el saldo cubre el objetivo. |
| Próximo pago | El día anterior; si la programación se crea para hoy o el servidor estuvo apagado, se avisa en cuanto corresponde al volver a ejecutar. |
| Pago registrado o pendiente | Confirma gastos recurrentes aplicados y avisa de posibles duplicados o límites. |
| Banco | Informa de cada aviso bancario nuevo detectado por Gmail. Revisa su estado para saber si se aplicó o quedó pendiente. |

El aviso de **presupuesto por acabarse** aparece en la pantalla cada vez que abres o inicias sesión, mientras se mantenga ese saldo. Marcar la notificación como leída no elimina este aviso. Se retira cuando el saldo vuelve a superar el umbral. Las alertas de umbral no generan una copia cada minuto; se actualizan y se reactivan si sales del umbral y luego vuelves a entrar.

Además de los avisos dentro de Ahorra+, esta edición incluye **Web Push** opcional. Se activa por dispositivo desde Ajustes → Notificaciones push y puede avisar con la app cerrada. Hay preferencias separadas para pagos recurrentes, presupuesto, movimientos nuevos, metas y banco. Los pagos empiezan a avisar desde 2 días antes; las alertas de presupuesto y meta se generan al cambiar los datos financieros. El sonido usa el tono predeterminado del sistema y, cuando el dispositivo lo admite, una vibración suave.

Las copias **JSON** conservan movimientos, meta y tasas, pero no las programaciones ni los avisos. Para respaldar todo, usa `npm run db:export -- --file backups/copia.json`. **Restablecer mis datos** elimina movimientos y meta; las programaciones siguen activas, así que páusalas por separado si no quieres más gastos automáticos.

## Panel de cuenta, modo oscuro y móvil

- Pulsa tu foto/inicial en la esquina superior para abrir el panel deslizante. Incluye nombre, foto, idioma, apariencia, **Cambiar moneda**, contraseña, enlace a correo bancario y cierre de sesión.
- En **Apariencia** elige **Claro**, **Oscuro** o **Sistema**. Se recuerda para tu espacio dentro de la cuenta. La entrada y el login siempre se muestran en claro/blanco.
- El escritorio mantiene su composición. Hasta 600 px se usa navegación inferior flotante, botón Registrar, campos cómodos para tocar y formularios tipo panel inferior. Respeta la preferencia de movimiento reducido.
- `localhost` en tu teléfono apunta al propio teléfono, no a tu PC. Para acceder desde otro dispositivo necesitas una dirección de servidor accesible y HTTPS; consulta la sección de despliegue. El Compose inicial sigue limitado al ordenador local. Cambiar el tamaño del navegador permite probar la vista móvil en tu PC.

## Funciones nuevas

### Inicio de sesión y perfil

- Crear cuenta, iniciar sesión y cerrar sesión.
- Registros aislados por usuario, incluso si dos usuarios usan el mismo ID de movimiento.
- **Ajustes → Mi cuenta:** cambiar nombre y foto de perfil.
- Fotos PNG, JPG o WebP de hasta 5 MB. La app recorta y reduce la imagen a 256 × 256, la convierte en JPEG y guarda la foto en Supabase.
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

