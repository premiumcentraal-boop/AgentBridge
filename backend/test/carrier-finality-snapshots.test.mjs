import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchCarrierReconciliation} from '../src/carrier-reconciliation.mjs';

// Synthetic eventual-consistency counterexample. This test documents a
// provider-contract gap; it does NOT establish SignalWire's actual behavior.
// No network calls or chargeable provider operations occur.
const SEG='48313c74-b321-4c08-a3ea-7123449130ab';
const CHILD='58313c74-b321-4c08-a3ea-7123449130ab';
const THIRD='68313c74-b321-4c08-a3ea-7123449130ab';
const DID='+12025550123', DEST='+12125550100';
const row={provider_segment_id:SEG,provider_call_id:'38313c74-b321-4c08-a3ea-7123449130ab',
  created_at:1800000000,destination:DEST,max_cost_cents:50};
const env={US_BRIDGE_DID:DID,SIGNALWIRE_SPACE:'example-space',
  SIGNALWIRE_PROJECT_ID:'271cda55-9a69-4513-b6de-67271d08b9bf',
  SIGNALWIRE_VOICE_API_TOKEN:'synthetic-read-only-token'};
const inbound={id:SEG,parent_id:null,status:'completed',direction:'inbound',
  from:'+12125550177',to:DID,charge:0.01};
const outbound={id:CHILD,parent_id:SEG,status:'completed',direction:'outbound-dial',
  from:DID,to:DEST,charge:0.02};
const late={id:THIRD,parent_id:SEG,status:'completed',direction:'outbound-dial',
  from:DID,to:DEST,charge:0.49};

function snapshot(entries){
  let requests=0;
  return {
    get requests(){return requests;},
    async fetch(url,opts){
      requests++;
      assert.equal(opts.method,'GET');
      assert.equal(opts.redirect,'error');
      assert.equal(opts.cache,'no-store');
      const payload=url.endsWith('/'+SEG)?inbound:{
        data:entries,
        links:{
          self:'https://example-space.signalwire.com/api/voice/logs?created_after=2027-01-15T07%3A58%3A00.000Z&page_size=1000',
          first:'https://example-space.signalwire.com/api/voice/logs?created_after=2027-01-15T07%3A58%3A00.000Z&page_size=1000'
        }
      };
      return new Response(JSON.stringify(payload),{status:200});
    }
  };
}

test('two independent valid snapshots cannot establish future billing finality',async()=>{
  const t0=snapshot([inbound,outbound]);
  const first=await fetchCarrierReconciliation(row,env,t0.fetch);
  assert.equal(t0.requests,2);
  // CURRENT BEHAVIOR, NOT A SECURITY GUARANTEE: a first complete-looking
  // snapshot is accepted. Do not use this assertion to authorize deployment.
  assert.equal(first.ok,true,JSON.stringify(first));
  assert.equal(first.actual_cost_cents,3);

  const t1=snapshot([inbound,outbound,late]);
  const second=await fetchCarrierReconciliation(row,env,t1.fetch);
  assert.equal(t1.requests,2);
  assert.equal(second.ok,false);
  assert.equal(second.code,'UNVERIFIED_OUTBOUND_LEGS');
  // If T0 already released the durable account lock, T1 cannot undo it.
  // Release must remain operator-gated until the provider supplies an
  // authoritative finality guarantee or an approved alternative.
});
