/** Configuration drift must never turn an approved DTMF reservation into caller-ID or open routing. */
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import {routingSetup,api,approveReservation,swml,call,DEST,CALLER} from './helpers/routing-env.mjs';
import {signalWireHangup} from '../src/signalwire.mjs';

const FLAGS={PRIVATE_TEST_OUTBOUND_ENABLED:'true',SIGNALWIRE_CONNECT_ENABLED:'true'};
const CID='38313c74-b321-4c08-a3ea-000000009991';

test('switching an already approved PIN reservation to unsafe modes never claims it',async t=>{
  const {env,DB}=await routingSetup(t,{...FLAGS,CALLER_PROOF_MODE:'dtmf_pin'});
  const created=await worker.fetch(api('/v1/reservations','POST',{
    destination:DEST,idempotency_key:'mode-drift-approved-1'
  }),env);
  assert.equal(created.status,201);
  const reservation=await created.json();
  await approveReservation(env,reservation.id);
  for(const mode of ['any_caller','capped_caller_id']){
    const changed={...env,CALLER_PROOF_MODE:mode,ANY_CALLER_RISK_ACCEPTED:'true',
      CALLER_ID_TRUST_ACCEPTED:'true',US_PILOT_ALLOW_CALLER_ID_PROOF:'true',
      TEST_CALLER_E164:CALLER};
    const response=await worker.fetch(swml({call:call({
      call_id:mode==='any_caller'?CID:'38313c74-b321-4c08-a3ea-000000009992',
      from_number:CALLER
    })}),changed);
    assert.equal(response.status,200,mode);
    assert.deepEqual(await response.json(),signalWireHangup(),mode);
    assert.equal(DB.raw.prepare('SELECT status FROM reservations WHERE id=?').get(reservation.id).status,
      'ready',mode+' must not consume the approved reservation');
  }
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM provider_events WHERE outcome='connect'").get().n,0);
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM reservation_carrier_legs').get().n,0);
});
