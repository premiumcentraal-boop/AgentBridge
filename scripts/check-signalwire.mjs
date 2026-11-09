/**
 * Private, read-only SignalWire connection preflight.
 * Run with secrets in the shell environment or a secret manager. Never put
 * API tokens in arguments, logs, browser pages, or GitHub Actions secrets here.
 */
import {inspectSignalWireNumbers} from '../backend/src/signalwire.mjs';
try{
  const result=await inspectSignalWireNumbers({
    space:process.env.SIGNALWIRE_SPACE,
    projectId:process.env.SIGNALWIRE_PROJECT_ID,
    apiToken:process.env.SIGNALWIRE_API_TOKEN
  });
  // Only owned voice DIDs and an inventory status are displayed.
  console.log(JSON.stringify(result,null,2));
  if(!result.voice_numbers.length||result.has_more){
    console.error('Check number ownership/pagination manually; no routing was enabled.');
    process.exitCode=2;
  }
}catch{
  console.error('SignalWire preflight failed. Check Space, Project ID, token scope (Numbers) and network permissions.');
  process.exitCode=1;
}
