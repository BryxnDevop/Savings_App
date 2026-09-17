import { CURRENCIES, CATEGORIES, validDate, totals } from './finance.js';
import { displayLedger } from './ledger.js';
export const DEFAULT_TIME_ZONE='America/Santo_Domingo';
export function zonedToday(now=new Date(),timeZone=DEFAULT_TIME_ZONE){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=type=>parts.find(p=>p.type===type).value;
 return `${value('year')}-${value('month')}-${value('day')}`;
}
export const dayDistance=(date,today)=>Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
export function nextOccurrence(current,frequency,anchor){
 if(!validDate(current)||!validDate(anchor))throw new Error('INVALID_RECURRING');
 const [year,month,day]=current.split('-').map(Number);const [,anchorMonth,anchorDay]=anchor.split('-').map(Number);
 if(frequency==='weekly')return new Date(Date.UTC(year,month-1,day+7,12)).toISOString().slice(0,10);
 if(!['monthly','yearly'].includes(frequency))throw new Error('INVALID_RECURRING');
 const y=frequency==='yearly'?year+1:year+(month===12?1:0),m=frequency==='yearly'?anchorMonth:month%12+1;
 if(y>9999)throw new Error('INVALID_RECURRING');
 const last=new Date(Date.UTC(y,m,0,12)).getUTCDate();
 return `${y}-${String(m).padStart(2,'0')}-${String(Math.min(anchorDay,last)).padStart(2,'0')}`;
}
export function validateRecurring(input){
 const name=typeof input.name==='string'?input.name.trim():'';
 if(!name||name.length>80||!Number.isSafeInteger(input.amountCents)||input.amountCents<=0||input.amountCents>99999999999||!Object.hasOwn(CURRENCIES,input.currency)||!Object.hasOwn(CATEGORIES,input.category)||!['monthly','weekly','yearly'].includes(input.frequency)||!validDate(input.nextDue)||input.nextDue>'9998-12-31')throw new Error('INVALID_RECURRING');
 return {name,amountCents:input.amountCents,currency:input.currency,category:input.category,frequency:input.frequency,nextDue:input.nextDue};
}
export function budgetStatus(ledger){
 const shown=displayLedger(ledger),sum=totals(shown.movements);
 const usedPercent=sum.income>0?Math.floor(sum.expense/sum.income*100):0;
 const low=sum.income>0&&sum.balance<=sum.income*.1;
 const remaining=shown.goal?Math.max(0,shown.goal.targetCents-Math.max(0,sum.balance)):null;
 return {...sum,currency:shown.currency,usedPercent,warning:sum.income>0&&sum.expense>=sum.income*.8,low,goal:shown.goal,remaining,nearGoal:!!shown.goal&&remaining>0&&remaining<=shown.goal.targetCents*.2,goalReached:!!shown.goal&&remaining===0};
}
