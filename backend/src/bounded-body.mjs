/**
 * Bounded webhook body reader: never buffer an untrusted request in full.
 * Reject malformed UTF-8 rather than silently changing the signed payload.
 */
export const MAX_WEBHOOK_BYTES=16_000;
export async function readBoundedWebhookBody(request,limit=MAX_WEBHOOK_BYTES){
  if(!Number.isSafeInteger(limit)||limit<1)throw new TypeError('Invalid limit');
  const header=request.headers.get('content-length');
  if(header!==null){
    if(!/^(0|[1-9][0-9]*)$/.test(header)||!Number.isSafeInteger(Number(header)))
      return null;
    if(Number(header)>limit)return null;
  }
  if(!request.body)return '';
  const reader=request.body.getReader();
  const chunks=[];
  let bytes=0,finished=false;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done){finished=true;break;}
      if(!(value instanceof Uint8Array))return null;
      bytes+=value.byteLength;
      if(bytes>limit)return null;
      chunks.push(value);
    }
    const combined=new Uint8Array(bytes);
    let offset=0;
    for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.length;}
    try{return new TextDecoder('utf-8',{fatal:true}).decode(combined);}
    catch{return null;}
  }finally{
    if(!finished)await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}
