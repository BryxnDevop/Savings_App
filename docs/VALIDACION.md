# Validación · Ahorra+ 4.0

Fecha: 17 de septiembre de 2026.

## Resultado

- `npm run build`: compilación React/PWA correcta; 40 módulos y 12 recursos de precaché.
- `npm test`: **41 pruebas aprobadas, 0 fallos**.
- `npm run test:embedded`: **1 integración API + SQL aprobada**.
- Supabase CLI **2.117.0** instalada y ejecutada; `supabase init` generó la configuración inicial. Se comprobaron las opciones de `link` y `db push` con esta versión.
- La CLI pudo leer la configuración en `migration list --local`, pero no conectar al puerto 54322 porque no hay un servicio Supabase local ejecutándose. No se ejecutó una migración en un proyecto remoto.

## Verificaciones nuevas

- SQL de la migración real ejecutado dos veces sin perder datos; esquema privado y RLS en las once tablas, incluida la versión de esquema.
- Roles `anon`, `authenticated` y `service_role` sin permiso para leer los datos privados.
- Conexiones remotas con verificación TLS; una URL con `sslmode=disable` no desactiva esa verificación. Rechazo del puerto del pooler de transacciones. Mensajes de diagnóstico sin mostrar la cadena de conexión.
- Traslado desde tablas en `public`, como la versión anterior, a `ahorra`, conservando saldo, monedas, revisión, nombre, idioma, foto, contraseña scrypt y sesión válida.
- Credencial Gmail conservada y descifrada con la clave anterior; progreso de lectura conservado y bloqueo del trabajador anterior liberado.
- Pagos y notificaciones conservados; un vencimiento procesado no vuelve a descontarse después de importar y ejecutar el trabajador.
- Respaldo con un registro inválido revierte toda la importación, incluidas las cuentas insertadas previamente. Un destino con datos rechaza la importación sin sobrescribirlos.
- Interfaz compilada: perfil → Cambiar moneda en ventana móvil simulada. Se cierra el panel de perfil antes del conversor, 150 USD se muestran como RD$8,865 con tasa de ejemplo 59.10, se guarda DOP sin alterar el importe original, se libera el desplazamiento y se vuelve a abrir el perfil.

## Cobertura conservada

Importes en centavos, fechas, metas, monedas mixtas, registros mensuales por quincena, respaldos financieros, autenticación y aislamiento entre cuentas, cookies y hashes, nombre/foto/idioma, conflictos de edición, persistencia en disco y reinicio, servicio PWA sin cachear API, interpretación de correos bancarios, deduplicación, cifrado Gmail, pagos recurrentes y recuperación de vencimientos, pausas y revisión de duplicados, notificaciones y alerta persistente de RD$200 restantes sobre RD$5,000 de entradas.

Las pruebas de interfaz también cubren apertura/cierre de Ajustes y del perfil, nombre largo, cambio de apariencia, ventana simulada de 320 px, teclado que reduce el área visible y alternativa accesible cuando `showModal` no está disponible.

## Límites de la verificación

La suite ejecutó SQL con **PostgreSQL 18.3 compilado a WebAssembly, PGlite 0.5.8**, mediante un adaptador de pruebas que serializa sus conexiones. La app de producción usa `pg` y la conexión de Supabase. No se dispuso de credenciales de tu proyecto: quedan pendientes la autenticación de la CLI, `db push` remoto, TLS real, permisos del propietario real, conexión por Supavisor y comportamiento con múltiples conexiones nativas. Tampoco se pudo ejecutar Docker Compose en este entorno.

La integración nativa incluida se puede ejecutar con `TEST_DATABASE_URL` y `npm run test:db` en una base de pruebas vacía, nunca sobre los registros reales.

Las pruebas de interfaz usan JSDOM y no miden geometría visual ni prueban un teléfono físico. La instalación de la PWA, el foco nativo de los diálogos y la selección/recorte de foto requieren comprobación en el navegador de destino.

Gmail y el proveedor de tasas usan transportes simulados. No se ha leído correo real ni probado el formato del banco del usuario. Antes de activar gastos bancarios automáticos debe verificarse un aviso concreto desde la pantalla de configuración.

## Comprobación en tu equipo

1. Sigue `docs/SUPABASE.md`, aplica la migración y ejecuta `npm run db:check`.
2. Si vienes de la versión anterior, importa el respaldo completo antes de iniciar la app y conserva la clave Gmail.
3. Ejecuta `npm start`, entra con tu cuenta y comprueba saldo, historial, pagos y perfil.
4. Pulsa tu foto → Cambiar moneda; revisa la vista previa, confirma y vuelve a tu moneda original.
5. Comprueba la conversión, el cierre del conversor y los paneles en un teléfono real, tanto en claro como en oscuro.
6. Revisa Gmail y crea un pago de prueba en una cuenta de pruebas; reinicia y confirma que no se duplica.
7. Instala o actualiza la PWA. Mantén Node en ejecución para acceder a tus datos y ejecutar las revisiones automáticas.
