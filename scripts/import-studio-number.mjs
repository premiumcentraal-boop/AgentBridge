import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSignalWireNumbers } from '../server/provider-numbers.mjs';
import { openStore } from '../server/store.mjs';

// Operator-only import of an already purchased number. Reads SignalWire
// inventory; never buys a number or changes the carrier's routing settings.
export async function importStudioNumber({env,number,label,orderId,confirmedOwner,store,fetcher=fetch}) {
  if(!confirmedOwner)throw new Error('Confirm that this SignalWire project belongs to this single-operator workspace.');
  if(!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(number)||typeof label!=='string'||!label.trim()||label.length>80||/[\u0000-\u001f\u007f]/.test(label))throw new Error('Use a US routing number and a short label.');
  const inventory=await readSignalWireNumbers(env,fetcher);
  const match=inventory.find(item=>item.number===number&&item.voice&&typeof item.id==='string'&&item.id.length>0);
  if(!match)throw new Error('The voice number was not confirmed in the provider project.');
  return store.registerRoutingNumber({provider:'signalwire',provider_number_id:match.id,e164:number,country:'US',label:label.trim(),ownership_source:'operator_project_verified'},orderId);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=key=>args.includes(key)?args[args.indexOf(key)+1]:undefined;
  const store=openStore(process.env.STUDIO_DATABASE_PATH||resolve('data/studio.sqlite'));
  try {
    const number=await importStudioNumber({env:process.env,number:value('--number'),label:value('--label'),orderId:args.includes('--order')?value('--order'):undefined,confirmedOwner:args.includes('--confirm-project-ownership'),store});
    console.log(JSON.stringify({id:number.id,number:number.e164,status:number.status,routing_enabled:false}));
  }catch { console.error('Number import failed. Check ownership confirmation, arguments, provider credentials and the requested number.');process.exitCode=1; }
  finally{store.close();}
}
