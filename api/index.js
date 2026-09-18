import { attachDatabasePool } from '@vercel/functions';
import { createVercelHandler } from '../server/vercel-runtime.mjs';

// No listen(), timers, filesystem writes or migrations during a Vercel request.
export default createVercelHandler({ attachPool: attachDatabasePool });
