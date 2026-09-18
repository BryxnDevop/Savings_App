-- Ejecutar una sola vez en Supabase SQL Editor DESPUÉS de desplegar Vercel.
-- 1. Habilitar pg_cron y pg_net desde Database > Extensions / Integrations > Cron.
-- 2. Crear en Vault los secretos ahorra_app_url (URL HTTPS, sin / final)
--    y ahorra_cron_secret (mismo valor que CRON_SECRET en Vercel, >=32 caracteres).
-- No es una migración: necesita la URL definitiva de TU despliegue.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')
 OR NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_net') THEN
  RAISE EXCEPTION 'Activa pg_cron y pg_net en Supabase antes de continuar.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='ahorra_app_url' AND decrypted_secret ~ '^https://[^/]+$') THEN
  RAISE EXCEPTION 'Crea en Vault ahorra_app_url con la URL HTTPS de producción, sin / final.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='ahorra_cron_secret' AND length(decrypted_secret)>=32) THEN
  RAISE EXCEPTION 'Crea en Vault ahorra_cron_secret con el valor de CRON_SECRET de Vercel.';
 END IF;
END $$;

-- Revisar cada cinco minutos. Cada buzón solo se lee cuando vence su plazo horario.
-- cron.schedule actualiza la programación del mismo nombre si vuelves a ejecutar.
SELECT cron.schedule('ahorra-vercel-tick','*/5 * * * *', $job$
 SELECT net.http_get(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='ahorra_app_url') || '/api/jobs',
  headers := jsonb_strip_nulls(jsonb_build_object(
   'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='ahorra_cron_secret'),
   'x-vercel-protection-bypass', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='ahorra_vercel_bypass')
  )),
  timeout_milliseconds := 240000
 );
$job$);
