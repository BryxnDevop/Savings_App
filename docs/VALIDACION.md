# Validación · Ahorra+ 3.1

Fecha: 16 de septiembre de 2026.

## Resultado

- Compilación React de producción: correcta.
- `npm test`: 28 pruebas aprobadas, 0 fallos.
- `npm run test:embedded`: integración API + SQL aprobada.
- Motor usado en la prueba SQL: PostgreSQL 18.3 (PGlite 0.5.8).
- Producción configurada para Node.js, controlador `pg` y PostgreSQL 17 mediante Docker.

## Cobertura

- Importes exactos en centavos, validación de fechas y saldos negativos.
- Compatibilidad de respaldos originales, v2 y v3; importación sin duplicados y detección de IDs en conflicto.
- 150 USD → 8,865 DOP con tasa 59.10; cambio de vuelta a 150 USD sin modificar el original.
- EUR y MXN; monedas mixtas, metas, cambios de tasa y cantidades pequeñas.
- Primera quincena hasta el 15; segunda desde el 16 e inclusión de los días 28, 29, 30 y 31.
- Creación de cuenta, inicio y cierre de sesión a través de la interfaz React compilada y la API real.
- Usuario A sin acceso al historial del usuario B; mismo ID de movimiento permitido en cuentas diferentes.
- Cookies HttpOnly/SameSite, tokens y contraseñas almacenados como hashes, sesión invalidada al salir.
- Cambio de contraseña e invalidación de otras sesiones.
- Cambio de nombre, idioma y foto en la API; rechazo de avatar SVG.
- Traducción de la interfaz, formatos y preferencia de idioma guardada en la cuenta.
- Protección de escrituras por origen y encabezado propio; SQL parametrizado.
- Escrituras con revisión: dos peticiones concurrentes con la misma revisión producen un éxito y un conflicto.
- Registro inválido rechazado sin perder el historial existente.
- Persistencia de cuenta y movimientos al cerrar y reabrir el motor de base de datos en disco.
- Perfil, sesión y movimientos conservados al reiniciar el servidor HTTP.
- Consulta de tasas con proveedor simulado determinista; consulta separada de la confirmación de la conversión.
- Errores de red y conflictos mostrados sin anunciar un guardado correcto.
- Manifiesto e iconos PWA, precaché de interfaz y exclusión de `/api/` del service worker.

## Cobertura nueva en 3.1

- Interpretación de ingresos y gastos con moneda original, dos formatos decimales y fecha de recepción.
- Correo no autorizado, falta de firma, falta de referencia, importe ambiguo, rechazo y pendiente no se aplican automáticamente.
- Cifrado AES-GCM con vinculación por usuario y rechazo al descifrar para otra cuenta.
- Revisión por vencimiento, pausa y reanudación, control de duplicados por mensaje y referencia, comprobación de conflicto de revisión del saldo.
- Aislamiento de cuentas en actividad bancaria y al aprobar pendientes.
- Confirmación manual, rechazo de una segunda aprobación, descarte, errores de conexión y desconexión sin borrar movimientos.
- Panel de cuenta abierto desde el avatar, guardado de nombre, modo oscuro/claro y persistencia de apariencia en el dispositivo.
- Configuración Gmail en interfaz, prueba de un aviso sin modificar saldo y desconexión.

## Límites

El entorno de ejecución no permite iniciar un servicio PostgreSQL nativo con un usuario del sistema diferente y no proporciona Docker. Se ejecutaron las consultas SQL y los flujos de API con PGlite, que contiene el motor PostgreSQL compilado a WebAssembly, y un adaptador de pruebas que serializa sus conexiones. La app entregada no usa ese adaptador en producción.

Quedan por comprobar en el equipo de destino el arranque de Docker Compose, la conexión del controlador `pg` al PostgreSQL nativo y el comportamiento con múltiples conexiones nativas. Se entrega `npm run test:db` para ejecutar la misma integración usando `TEST_DATABASE_URL`.

El navegador remoto disponible bloqueó las direcciones y archivos locales en esta conversación. La revisión visual, la instalación PWA del sistema operativo y la selección/recorte de una foto mediante el navegador requieren comprobación local. Las pruebas de interfaz usan JSDOM; no verifican la geometría visual ni el foco nativo de los diálogos.

La integración de Gmail usa transporte simulado: no se ha conectado una cuenta real de Google ni probado un aviso real del banco del usuario. El parser debe verificarse con el formato concreto antes de activar descuentos automáticos. Las cabeceras de autenticación usadas en las pruebas son ejemplos de las que devuelve Gmail.

La integración de tasas valida la respuesta esperada mediante un proveedor simulado. La disponibilidad de la fuente externa en el equipo del usuario depende de su conexión. Los fallos conservan las tasas guardadas.

## Comprobación local recomendada

1. Ejecuta la configuración y `docker compose up -d --build --wait`.
2. Crea dos cuentas. Registra 150 USD en una y comprueba que la otra no muestra ese movimiento.
3. Selecciona DOP con tasa 59.10. Confirma que el saldo es 8,865 DOP. Vuelve a USD y verifica 150 USD.
4. Añade una entrada el 15 y un gasto el 16 de un mes pasado. En Registro mensual verifica la separación de quincenas.
5. Cambia tu nombre y foto y alterna Español/English. Cierra sesión y vuelve a entrar para comprobar la persistencia.
6. Exporta un respaldo JSON e impórtalo en la misma cuenta: los duplicados idénticos deben omitirse.
7. Reinicia los contenedores sin borrar el volumen. Comprueba que puedes iniciar sesión y recuperar los datos.
8. Instala la PWA en Chrome/Edge y verifica su acceso directo.

9. Pulsa la foto y comprueba el panel de cuenta, los tres modos de apariencia y su persistencia al recargar.
10. En dimensiones de 320, 390 y 600 px, revisa navegación, tablas, contraste y formularios; prueba también un móvil real.
11. Conecta Gmail con una contraseña de aplicación. Configura el remitente del banco y prueba un texto real anonimizado.
12. Envía o recibe una alerta bancaria nueva y usa Revisar ahora. Comprueba el estado, moneda, fecha y efecto en el saldo antes de activar registro automático. Revisa dos veces: no debe duplicarse el movimiento.
13. Deja el navegador cerrado y el servidor encendido: después de una hora, verifica la fecha de última revisión. Pausa la conexión y comprueba que no se aplican nuevos avisos.
