import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, validateLedger, displayLedger, convertCents, DEFAULT_RATES, fortnightGroups, readBackup, mergeLedger } from '../src/lib/ledger.js';
const m = changes => ({ id:'a',type:'income',amountCents:15000,currency:'USD',reason:'Ahorro',date:'2026-04-15',note:'',category:'savings',...changes });
test('150 USD se muestran como 8,865 DOP con tasa 59.10 y vuelven exactamente a 150 USD',()=>{
  const original=validateLedger({...emptyLedger(),movements:[m()]});
  const dop=validateLedger({...original,currency:'DOP'});
  assert.equal(displayLedger(dop).movements[0].amountCents,886500);
  assert.equal(displayLedger({...dop,currency:'USD'}).movements[0].amountCents,15000);
  assert.equal(dop.movements[0].amountCents,15000);assert.equal(dop.movements[0].currency,'USD');
  assert.equal(displayLedger({...original,currency:'EUR'}).movements[0].amountCents,13800);
  assert.equal(displayLedger({...original,currency:'MXN'}).movements[0].amountCents,277500);
});
test('Conversión cruzada, movimientos mixtos, tasas actualizadas y meta conservan originales',()=>{
  const ledger=validateLedger({...emptyLedger(),currency:'USD',movements:[m({currency:'DOP',amountCents:886500})],goal:{name:'Viaje',targetCents:886500,currency:'DOP'}});
  const view=displayLedger(ledger);assert.equal(view.movements[0].amountCents,15000);assert.equal(view.goal.targetCents,15000);assert.equal(view.goal.progressPercent,100);
  assert.equal(displayLedger({...ledger,rates:{...ledger.rates,DOP:60}}).movements[0].amountCents,14775);
  const tiny=displayLedger({...emptyLedger(),currency:'USD',movements:[],goal:{name:'Pequeña',targetCents:1,currency:'COP'}});
  assert.equal(tiny.goal.progressPercent,0);assert.ok(Number.isFinite(tiny.goal.progressPercent));
  assert.equal(convertCents(1,'USD','EUR',DEFAULT_RATES),1);
});
test('Registro de abril: día 15 en primera quincena; 16 y 30 en segunda, otros meses fuera',()=>{
  const groups=fortnightGroups([m(),m({id:'b',date:'2026-04-16',type:'expense',amountCents:1000}),m({id:'c',date:'2026-04-30',amountCents:5000}),m({id:'d',date:'2026-05-01'})],'2026-04');
  assert.equal(groups[0].items.length,1);assert.equal(groups[0].income,15000);assert.equal(groups[1].expense,1000);assert.equal(groups[1].income,5000);assert.equal(groups[1].balance,4000);assert.equal(groups[1].to,30);
  assert.equal(fortnightGroups([m({date:'2026-01-31'})],'2026-01')[1].items.length,1);
  assert.equal(fortnightGroups([],'2024-02')[1].to,29);assert.equal(fortnightGroups([],'2025-02')[1].to,28);
  assert.deepEqual(fortnightGroups([],'2026-06').map(g=>g.balance),[0,0]);
});
test('Respaldos v1, v2 y v3 migran sin borrar ni duplicar registros',()=>{
  const old=readBackup(JSON.stringify([{id:'old',type:'income',amount:150,reason:'Salario',date:'2026-04-01'}]),'DOP');
  assert.equal(old.movements[0].currency,'DOP');
  const v2=readBackup(JSON.stringify({version:2,currency:'EUR',goal:null,movements:[m()]}));assert.equal(v2.movements[0].currency,'EUR');
  const roundtrip=readBackup(JSON.stringify(old));assert.deepEqual(roundtrip,old);
  const first=mergeLedger(emptyLedger(),old);assert.equal(first.added,1);assert.equal(mergeLedger(first.ledger,old).skipped,1);
  assert.throws(()=>mergeLedger(first.ledger,{...old,movements:[{...old.movements[0],reason:'Distinto'}]}),/IMPORT_CONFLICT/);
  assert.throws(()=>validateLedger({...emptyLedger(),rates:{...DEFAULT_RATES,DOP:0}}),/INVALID_RATES/);
});
