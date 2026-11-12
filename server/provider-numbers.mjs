import {readBoundedWebhookBody} from '../backend/src/bounded-body.mjs';

// A read-only provider boundary for operator inventory import. It deliberately
// contains no purchase, release, reassignment or routing command.
export async function readSignalWireNumbers(env, fetcher=fetch) {
  const space=env.SIGNALWIRE_SPACE,project=env.SIGNALWIRE_PROJECT_ID,token=env.SIGNALWIRE_API_TOKEN;
  if(typeof space!=='string'||!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(space)||typeof project!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(project)||typeof token!=='string'||token.length<10||token.length>512||/[\s:]/.test(token))throw new Error('INVALID_PROVIDER_CONFIG');
  const response=await fetcher('https://'+space+'.signalwire.com/api/relay/rest/phone_numbers?page_size=100',{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),headers:{authorization:'Basic '+btoa(project+':'+token),accept:'application/json'}});
  if(!response.ok)throw new Error('PROVIDER_UNAVAILABLE');
  const text=await readBoundedWebhookBody(response,250_000);
  if(text===null)throw new Error('INVALID_PROVIDER_RESPONSE');
  const payload=JSON.parse(text);
  if(!Array.isArray(payload.data))throw new Error('INVALID_PROVIDER_RESPONSE');
  return payload.data.filter(item=>item&&typeof item.number==='string'&&/^\+[1-9]\d{7,14}$/.test(item.number)&&typeof item.id==='string'&&item.id.length>0&&item.id.length<=100&&Array.isArray(item.capabilities)&&item.capabilities.includes('voice')).map(item=>({number:item.number,id:item.id,voice:true}));
}
