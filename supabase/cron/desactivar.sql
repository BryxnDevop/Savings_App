-- Solo detiene esta programación. Conserva cuentas, gastos y credenciales.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='ahorra-vercel-tick';
