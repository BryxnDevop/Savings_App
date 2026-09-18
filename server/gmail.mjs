import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

async function session(email, password, work, timeout = 120000) {
  const client = new ImapFlow({ host:'imap.gmail.com', port:993, secure:true, auth:{user:email,pass:password}, logger:false, connectionTimeout:15000, greetingTimeout:15000, socketTimeout:20000, disableAutoIdle:true });
  client.on('error',()=>{});
  const deadline=setTimeout(()=>client.close(),timeout);deadline.unref();
  try { await client.connect(); return await work(client); }
  finally { clearTimeout(deadline); client.close(); }
}
export const gmailTransport = {
  async connect(email,password) {
    return session(email,password,async client=>{
      const boxes=await client.list();
      const mailbox=boxes.find(b=>b.specialUse==='\\All')?.path || 'INBOX';
      const lock=await client.getMailboxLock(mailbox,{readOnly:true});
      try{return { mailbox, uidValidity:String(client.mailbox.uidValidity), lastUid:Math.max(0,client.mailbox.uidNext-1) };}finally{lock.release();}
    },30000);
  },
  async scan(connection,password,consume,timeout = 120000) {
    return session(connection.settings.email,password,async client=>{
      const lock=await client.getMailboxLock(connection.mailbox,{readOnly:true});
      try {
        if(String(client.mailbox.uidValidity)!==connection.uid_validity) throw new Error('MAIL_RECONNECT');
        const ceiling=client.mailbox.uidNext-1;
        if(ceiling<=Number(connection.last_uid))return {lastUid:Number(connection.last_uid),more:false};
        const senders=connection.settings.senders.map(from=>({from}));
        const search={uid:`${Number(connection.last_uid)+1}:${ceiling}`,...(senders.length===1?senders[0]:{or:senders})};
        const found=await client.search(search,{uid:true});
        const uids=(found||[]).filter(uid=>uid>Number(connection.last_uid)&&uid<=ceiling).sort((a,b)=>a-b);
        const batch=uids.slice(0,100);
        for(const uid of batch) {
          const meta=await client.fetchOne(uid,{size:true,internalDate:true,emailId:true,envelope:true},{uid:true});
          if(!meta)continue;
          const receivedAt=meta.internalDate||new Date();
          if(meta.size>512000){
            await consume({uid,key:String(meta.emailId||`${connection.uid_validity}:${uid}`),receivedAt,oversized:true,mail:{subject:meta.envelope?.subject,from:{value:meta.envelope?.from||[]}}});continue;
          }
          const message=await client.fetchOne(uid,{source:{start:0,maxLength:512001}},{uid:true});
          if(!message?.source)continue;
          if(message.source.length>512000)continue;
          const mail=await simpleParser(message.source,{skipHtmlToText:false,skipTextToHtml:true,skipImageLinks:true,maxHtmlLengthToParse:512000});
          await consume({uid,key:String(meta.emailId||`${connection.uid_validity}:${uid}`),receivedAt,mail});
        }
        return {lastUid:uids.length>100?batch.at(-1):ceiling,more:uids.length>100};
      }finally{lock.release();}
    },timeout);
  }
};
