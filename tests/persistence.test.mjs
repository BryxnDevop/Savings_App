import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { embeddedPool } from './helpers/embedded-pool.mjs';
import { migrate,newWallet,writeWallet,readWallet } from '../server/db.mjs';
import { emptyLedger } from '../src/lib/ledger.js';
import { randomUUID } from 'node:crypto';
test('Persistencia SQL en disco: cerrar motor, reabrir y conservar cuenta y registros',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ahorra-pg-'));let pool;
  try{pool=await embeddedPool(dir);await migrate(pool);const id=randomUUID();await pool.query('INSERT INTO ahorra_users(id,email,password_hash,name) VALUES($1,$2,$3,$4)',[id,'persist@test.invalid','test-only-hash','Test']);await newWallet(pool,id);const ledger={...emptyLedger(),movements:[{id:'persist',type:'income',amountCents:15000,currency:'USD',date:'2026-04-15',reason:'Persistente',category:'savings',note:''}]};await writeWallet(pool,id,{revision:0,ledger});await pool.end();pool=null;pool=await embeddedPool(dir);const restored=await readWallet(pool,id);assert.equal(restored.revision,1);assert.equal(restored.ledger.movements[0].amountCents,15000);assert.equal((await pool.query('SELECT name FROM ahorra_users WHERE id=$1',[id])).rows[0].name,'Test');}
  finally{if(pool)await pool.end();await rm(dir,{recursive:true,force:true});}
});
