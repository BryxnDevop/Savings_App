import { PGlite } from '@electric-sql/pglite';

// Test-only adapter. PGlite runs PostgreSQL compiled to WASM; it has one
// connection. Serialize leases to preserve transaction boundaries.
// Production always uses node-postgres and DATABASE_URL.
export async function embeddedPool(path) {
  const db=new PGlite(path);await db.waitReady;let queue=Promise.resolve();
  async function query(sql,params){if(params?.length)return db.query(sql,params);const results=await db.exec(sql);return results[results.length-1]||{rows:[]};}
  const pool={async connect(){let unlock;const next=new Promise(r=>{unlock=r;});const previous=queue;queue=next;await previous;let released=false;return{query,release(){if(!released){released=true;unlock();}}};},async query(sql,params){const client=await pool.connect();try{return await client.query(sql,params);}finally{client.release();}},async end(){await queue;await db.close();}};
  return pool;
}
