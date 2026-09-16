import { spawn } from 'node:child_process';
const child=spawn(process.execPath,['--test','tests/postgres.integration.mjs'],{stdio:'inherit',env:{...process.env,TEST_PGLITE:'1'}});
child.on('exit',code=>{process.exitCode=code||0;});
