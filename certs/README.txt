Si tu conexión TLS necesita el certificado raíz del proyecto, descarga el certificado desde Supabase > Database Settings y guárdalo como supabase-ca.crt en esta carpeta.
En .env configura DB_SSL_CA_FILE=./certs/supabase-ca.crt
Docker monta esta carpeta de solo lectura. No desactives la verificación TLS.
