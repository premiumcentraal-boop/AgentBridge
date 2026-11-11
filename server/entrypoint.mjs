// Railway mounts new volumes as root. Prepare only the dedicated data directory,
// then permanently drop privileges before accepting any HTTP requests.
import {mkdirSync,chownSync,chmodSync} from 'node:fs';
if (process.getuid?.() === 0) {
  mkdirSync('/data',{recursive:true,mode:0o700});
  chownSync('/data',1000,1000);chmodSync('/data',0o700);
  process.setgid(1000);process.setuid(1000);
}
const {createApp}=await import('./app.mjs');
const server=createApp();
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('AgentBridge product and studio server is ready.'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close());
