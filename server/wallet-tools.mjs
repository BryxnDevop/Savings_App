// Use inside a transaction. Holding the wallet lock also serializes manual writes.
export async function lockedLedger(client,userId){
 const {rows:[w]}=await client.query('SELECT * FROM ahorra.ahorra_wallets WHERE user_id=$1 FOR UPDATE',[userId]);
 if(!w)throw new Error('WALLET_NOT_FOUND');
 const {rows}=await client.query("SELECT id,type,amount_cents,currency,reason,to_char(date,'YYYY-MM-DD') AS date,note,category FROM ahorra.ahorra_movements WHERE user_id=$1 ORDER BY position",[userId]);
 return {version:3,currency:w.currency,rates:w.rates,rateInfo:w.rate_info,goal:w.goal,movements:rows.map(({amount_cents,...m})=>({...m,amountCents:Number(amount_cents)}))};
}
