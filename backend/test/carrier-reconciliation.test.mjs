import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchCarrierReconciliation} from '../src/carrier-reconciliation.mjs';

const DID='+12025550123',DEST='+12125550100';
const SEG='48313c74-b321-4c08-a3ea-7123449130ab';
const CALL='38313c74-b321-4c08-a3ea-7123449130ab';
const CHILD='58313c74-b321-4c08-a3ea-7123449130ab';
const PROJECT='271cda55-9a69-4513-b6de-67271d08b9bf';
const SECRET='private-voice-log-read-token';
const row={provider_segment_id:SEG,provider_call_id:CALL,created_at:1800000000,
  destination:DEST,max_cost_cents:50};
const env={US_BRIDGE_DID:DID,SIGNALWIRE_SPACE:'example-space',
  SIGNALWIRE_PROJECT_ID:PROJECT,SIGNALWIRE_VOICE_API_TOKEN:SECRET};
const inbound={id:SEG,status:'completed',direction:'inbound',to:DID,charge:0.01};
const child={id:CHILD,parent_id:SEG,direction:'outbound',from:DID,to:DEST,status:'completed',charge:0.02};
const COMPLETE_LINKS={self:'https://example-space.signalwire.com/api/voice/logs?page_size=1000&created_after=2027-01-15T07%3A58%3A00.000Z',
  first:'https://example-space.signalwire.com/api/voice/logs?page_size=1000&created_after=2027-01-15T07%3A58%3A00.000Z'};
function provider(inRow=inbound,children=[child],links=COMPLETE_LINKS,includeInbound=true){
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    const entries=!includeInbound||children.some(x=>x?.id===SEG)?children:[inRow,...children];
    const payload=url.endsWith('/'+SEG)?inRow:{data:entries,links};
    return new Response(JSON.stringify(payload),{status:200});
  };
  return {fetchImpl,calls};
}
test('requires two terminal verified carrier segments and sums real A/B charges',async()=>{
  const p=provider();
  const result=await fetchCarrierReconciliation(row,env,p.fetchImpl);
  assert.deepEqual(result,{ok:true,inbound_segment_id:SEG,outbound_segment_id:CHILD,
    outbound_status:'completed',actual_cost_cents:3,source:'verified_project_voice_logs',terminal:true});
  assert.equal(p.calls.length,2);
  assert.ok(p.calls[0].url.endsWith('/api/voice/logs/'+SEG));
  assert.equal(new URL(p.calls[1].url).pathname,'/api/voice/logs');
  assert.equal(new URL(p.calls[1].url).searchParams.get('page_size'),'1000');
  for(const c of p.calls){
    assert.equal(c.options.method,'GET');
    assert.equal(c.options.redirect,'error');
    assert.equal(new URL(c.url).hostname,'example-space.signalwire.com');
    assert.equal(c.options.headers.authorization,'Basic '+btoa(PROJECT+':'+SECRET));
    assert.equal(c.options.cache,'no-store');
  }
  assert.ok(!JSON.stringify(result).includes(SECRET));
});
test('unavailable Voice-only credential or invalid UUID never contacts provider',async()=>{
  let calls=0;const fail=async()=>{calls++;throw Error('must not call provider')};
  const a=await fetchCarrierReconciliation(row,{...env,SIGNALWIRE_VOICE_API_TOKEN:undefined},fail);
  assert.equal(a.code,'VOICE_LOG_CREDENTIALS_REQUIRED');
  const b=await fetchCarrierReconciliation({...row,provider_segment_id:'bad'},env,fail);
  assert.equal(b.code,'MISSING_CARRIER_IDENTIFIERS');
  assert.equal(calls,0);
});
test('fail closed on stale, mismatched, multiple or paginated voice logs',async()=>{
  const cases=[
    provider({...inbound,status:'ringing'}),
    provider({...inbound,status:'completed',to:'+12025550144'}),
    provider(inbound,[{...child,status:'ringing'}]),
    provider(inbound,[{...child,to:'+12125550155'}]),
    provider(inbound,[{...child,from:'+13125550111'}]),
    provider(inbound,[{...child,from:null}]),
    provider(inbound,[{...child,id:'not-a-uuid'}]),
    provider(inbound,[]),
    provider(inbound,[child,{...child,id:'68313c74-b321-4c08-a3ea-7123449130ab'}]),
    provider(inbound,[child],{...COMPLETE_LINKS,next:'opaque-page-token'}),
    provider(inbound,[child],{...COMPLETE_LINKS,next:0}),
    provider(inbound,[child],{...COMPLETE_LINKS,next:false}),
    provider(inbound,[child],{...COMPLETE_LINKS,next:{}}),
    provider({...inbound,charge:'1.00'}),
    provider(inbound,[{...child,charge:99}])
  ];
  for(const p of cases){
    const r=await fetchCarrierReconciliation(row,env,p.fetchImpl);
    assert.equal(r.ok,false,'unexpected unlock from mismatched carrier logs: '+JSON.stringify(r));
  }
});
test('missing or malformed pagination metadata cannot prove exhaustive child legs',async()=>{
  for(const links of [null,{}, {next:null}, {self:'x'}, {first:'x'},
    {self:'',first:'x'}, {self:'x',first:''}]){
    const p=provider(inbound,[child],links);
    const result=await fetchCarrierReconciliation(row,env,p.fetchImpl);
    assert.equal(result.code,'INCOMPLETE_CARRIER_PAGINATION',JSON.stringify({links,result}));
  }
});
test('full Voice Logs page without continuation remains locked even with expected child',async()=>{
  const unrelated=Array.from({length:998},(_,i)=>({
    id:'78313c74-b321-4c08-a3ea-'+i.toString(16).padStart(12,'0'),parent_id:null,direction:'outbound',to:'+13125550100'
  }));
  const full=provider(inbound,[child,...unrelated],COMPLETE_LINKS);
  const denied=await fetchCarrierReconciliation(row,env,full.fetchImpl);
  assert.equal(denied.code,'INCOMPLETE_CARRIER_PAGINATION');
  assert.equal(denied.ok,false);
  // The conservative boundary must not reject an otherwise valid smaller page.
  const smaller=provider(inbound,[child,...unrelated.slice(1)],COMPLETE_LINKS);
  const accepted=await fetchCarrierReconciliation(row,env,smaller.fetchImpl);
  assert.equal(accepted.ok,true,JSON.stringify(accepted));
});
test('malformed and duplicate carrier entries fail closed',async()=>{
  const other={...child,id:'78313c74-b321-4c08-a3ea-7123449130ab',parent_id:null};
  for(const entries of [[child,null],[child,7],[child,{}],[child,child],[child,other,other]]){
    const result=await fetchCarrierReconciliation(row,env,provider(inbound,entries).fetchImpl);
    assert.equal(result.code,'AMBIGUOUS_CARRIER_LOG_ENTRIES');
  }
  // A UUID's letter case does not make it a different provider segment.
  const caseVariant=await fetchCarrierReconciliation(row,env,
    provider(inbound,[child,{...child,id:CHILD.toUpperCase(),parent_id:null}]).fetchImpl);
  assert.equal(caseVariant.code,'AMBIGUOUS_CARRIER_LOG_ENTRIES');
  const inboundCaseVariant=await fetchCarrierReconciliation(row,env,
    provider(inbound,[child,{...inbound,id:SEG.toUpperCase()}]).fetchImpl);
  assert.equal(inboundCaseVariant.code,'AMBIGUOUS_CARRIER_LOG_ENTRIES');
  const valid=await fetchCarrierReconciliation(row,env,provider(inbound,[child,other]).fetchImpl);
  assert.equal(valid.ok,true);
});
test('malformed segment and parent IDs cannot conceal a third billable leg',async()=>{
  const extra={...child,id:'68313c74-b321-4c08-a3ea-7123449130ab',charge:0.5};
  for(const variant of [
    {...extra,parent_id:'not-a-uuid'},
    {...extra,parent_id:42},
    {...extra,parent_id:{}},
    {...extra,parent_id:''},
    {...extra,parent_id:CHILD.slice(0,-1)},
    {...extra,id:'malformed',parent_id:null}
  ]){
    const result=await fetchCarrierReconciliation(row,env,
      provider(inbound,[child,variant]).fetchImpl);
    assert.equal(result.code,'AMBIGUOUS_CARRIER_LOG_ENTRIES',JSON.stringify(result));
  }
  const unrelated=await fetchCarrierReconciliation(row,env,
    provider(inbound,[child,{...extra,parent_id:null}]).fetchImpl);
  assert.equal(unrelated.ok,true,JSON.stringify(unrelated));
});
test('valid but orphaned parent UUIDs cannot hide extra billable legs',async()=>{
  const extra={...child,id:'68313c74-b321-4c08-a3ea-7123449130ab',
    parent_id:'98313c74-b321-4c08-a3ea-7123449130ab',charge:0.75};
  const orphan=await fetchCarrierReconciliation(row,env,
    provider(inbound,[child,extra]).fetchImpl);
  assert.equal(orphan.code,'ORPHANED_CARRIER_LOG_PARENT',JSON.stringify(orphan));
  const mixedCase=await fetchCarrierReconciliation(row,env,
    provider(inbound,[child,{...extra,parent_id:extra.parent_id.toUpperCase()}]).fetchImpl);
  assert.equal(mixedCase.code,'ORPHANED_CARRIER_LOG_PARENT',JSON.stringify(mixedCase));
  const unrelatedRoot=await fetchCarrierReconciliation(row,env,
    provider(inbound,[child,{...extra,parent_id:null}]).fetchImpl);
  assert.equal(unrelatedRoot.ok,true,JSON.stringify(unrelatedRoot));
});
test('cyclic carrier ancestry cannot masquerade as unrelated harmless records',async()=>{
  const a='68313c74-b321-4c08-a3ea-7123449130ab';
  const b='78313c74-b321-4c08-a3ea-7123449130ab';
  const cases=[
    [{id:a,parent_id:a,direction:'outbound',charge:0.25}],
    [{id:a,parent_id:b,direction:'outbound',charge:0.25},
      {id:b,parent_id:a,direction:'outbound',charge:0.25}],
    [{id:a,parent_id:b,direction:'outbound',charge:0.25},
      {id:b,parent_id:b,direction:'outbound',charge:0.25}]
  ];
  for(const records of cases){
    const result=await fetchCarrierReconciliation(row,env,
      provider(inbound,[child,...records]).fetchImpl);
    assert.equal(result.code,'CYCLIC_CARRIER_LOG_PARENT',JSON.stringify(result));
    assert.equal(result.ok,false);
  }
  // Legitimate unrelated trees, including mixed-case parent IDs, stay valid.
  const good=await fetchCarrierReconciliation(row,env,
    provider(inbound,[child,{id:a,parent_id:null},
      {id:b,parent_id:a.toUpperCase()}]).fetchImpl);
  assert.equal(good.ok,true,JSON.stringify(good));
});
test('nested outbound carrier legs cannot be omitted from the billed two-leg total',async()=>{
  const grandchild={id:'88313c74-b321-4c08-a3ea-7123449130ab',parent_id:CHILD,
    direction:'outbound-dial',from:DEST,to:'+442079460000',status:'completed',charge:0.25};
  for(const nested of [grandchild,{...grandchild,status:'in-progress'},
    {...grandchild,charge:undefined}]){
    const result=await fetchCarrierReconciliation(row,env,
      provider(inbound,[child,nested]).fetchImpl);
    assert.equal(result.ok,false,JSON.stringify(result));
    assert.equal(result.code,'UNVERIFIED_NESTED_OUTBOUND_LEGS');
  }
  const unrelated={...grandchild,parent_id:'78313c74-b321-4c08-a3ea-7123449130ab'};
  const result=await fetchCarrierReconciliation(row,env,
    provider(inbound,[child,unrelated]).fetchImpl);
  assert.equal(result.code,'ORPHANED_CARRIER_LOG_PARENT',JSON.stringify(result));
});
test('actual charges above reservation cap never unlock',async()=>{
  const p=provider({...inbound,charge:0.03},[{...child,charge:0.03}]);
  const r=await fetchCarrierReconciliation({...row,max_cost_cents:3},env,p.fetchImpl);
  assert.equal(r.code,'ACTUAL_CHARGE_EXCEEDS_RESERVED_CAP');
});
test('non-200, invalid JSON and oversized provider documents fail closed',async()=>{
  for(const fake of [
    async()=>new Response('Unavailable',{status:503}),
    async()=>new Response('{invalid-json'),
    async()=>new Response('x'.repeat(270000))
  ]){
    const r=await fetchCarrierReconciliation(row,env,fake);
    assert.equal(r.ok,false);
  }
});

// Realistic fixtures shaped like SignalWire's documented Voice Logs responses
// (GET /api/voice/logs/{id} and GET /api/voice/logs; Voice.RelayVoiceLog).
const docInbound={billing_ms:60000,charge:0.0045,charge_details:[],created_at:'2027-01-15T08:00:05Z',
  direction:'inbound',duration:42,duration_ms:41980,from:'+12125550177',id:SEG,parent_id:null,
  qos_metrics:null,source:'realtime_api',status:'completed',to:DID,type:'relay_pstn_call',url:null};
const docChild={billing_ms:30000,charge:0.0085,charge_details:[{description:'Outbound PSTN',charge:0.0085}],
  created_at:'2027-01-15T08:00:20Z',direction:'outbound-dial',duration:25,duration_ms:25010,
  from:DID,id:CHILD,parent_id:SEG,qos_metrics:null,source:'realtime_api',status:'ended',to:DEST,
  type:'relay_pstn_call',url:null};
const docLinks={self:'https://example-space.signalwire.com/api/voice/logs?page_number=0&page_size=1000&created_after=2027-01-15T07%3A58%3A00.000Z',
  first:'https://example-space.signalwire.com/api/voice/logs?page_size=1000&created_after=2027-01-15T07%3A58%3A00.000Z'};
test('documented Voice Logs shapes reconcile: ended status, outbound-dial direction, unrelated logs ignored',async()=>{
  const unrelated={...docChild,id:'78313c74-b321-4c08-a3ea-7123449130ab',parent_id:null,to:'+13125550100'};
  const p=provider(docInbound,[docInbound,unrelated,docChild],undefined);
  const fetchImpl=async(url,o)=>{
    const payload=url.endsWith('/'+SEG)?docInbound:{links:docLinks,data:[docInbound,unrelated,docChild]};
    return new Response(JSON.stringify(payload),{status:200});
  };
  const r=await fetchCarrierReconciliation(row,env,fetchImpl);
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.actual_cost_cents,2,'0.0045+0.0085 dollars rounds up to 2 cents');
  assert.equal(r.outbound_status,'ended');
});
test('an unanswered (busy/no-answer) B-leg is terminal and reconciles at its charge',async()=>{
  for(const status of ['busy','no-answer','failed','canceled']){
    const p=provider(docInbound,[{...docChild,status,charge:0}],docLinks);
    const r=await fetchCarrierReconciliation(row,env,p.fetchImpl);
    assert.equal(r.ok,true,status);
  }
});
test('float charges do not over-round (0.1 + 0.2 dollars = 30 cents)',async()=>{
  const p=provider({...docInbound,charge:0.1},[{...docChild,charge:0.2}],docLinks);
  const r=await fetchCarrierReconciliation({...row,max_cost_cents:30},env,p.fetchImpl);
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.actual_cost_cents,30);
});
test('missing or unexpected documented fields stay locked with a specific code, never throw',async()=>{
  const drop=(o,k)=>{const c={...o};delete c[k];return c;};
  const cases=[
    [provider(drop(docInbound,'status'),[docChild],docLinks),'INBOUND_CARRIER_NOT_TERMINAL'],
    [provider(docInbound,[drop(docChild,'from')],docLinks),'OUTBOUND_LOG_MISMATCH'],
    [provider(docInbound,[{...docChild,from:'+13125550111'}],docLinks),'OUTBOUND_LOG_MISMATCH'],
    [provider(docInbound,[{...docChild,id:'not-a-uuid'}],docLinks),'AMBIGUOUS_CARRIER_LOG_ENTRIES'],
    [provider({...docInbound,status:'ending'},[docChild],docLinks),'INBOUND_CARRIER_NOT_TERMINAL'],
    [provider(drop(docInbound,'charge'),[docChild],docLinks),'INBOUND_CHARGE_UNKNOWN'],
    [provider(drop(docInbound,'to'),[docChild],docLinks),'INBOUND_LOG_MISMATCH'],
    [provider(drop(docInbound,'id'),[docChild],docLinks),'AMBIGUOUS_CARRIER_LOG_ENTRIES'],
    [provider(docInbound,[drop(docChild,'parent_id')],docLinks),'UNVERIFIED_OUTBOUND_LEGS'],
    [provider(docInbound,[drop(docChild,'direction')],docLinks),'OUTBOUND_LOG_MISMATCH'],
    [provider(docInbound,[{...docChild,direction:'inbound'}],docLinks),'OUTBOUND_LOG_MISMATCH'],
    [provider(docInbound,[{...docChild,status:'in-progress'}],docLinks),'OUTBOUND_CARRIER_NOT_TERMINAL'],
    [provider(docInbound,[drop(docChild,'charge')],docLinks),'OUTBOUND_CHARGE_UNKNOWN'],
    [provider(docInbound,[null,7,'x',docChild],{...docLinks,next:docLinks.self+'&page_token=abc'}),'PAGINATED_CARRIER_LOGS'],
    [provider([],[docChild],docLinks),'INCOMPLETE_CARRIER_LOGS']
  ];
  for(const [p,code] of cases){
    const r=await fetchCarrierReconciliation(row,env,p.fetchImpl);
    assert.equal(r.ok,false);
    assert.equal(r.code,code,JSON.stringify(r));
  }
  const weird=await fetchCarrierReconciliation(row,env,async()=>({get ok(){throw Error('boom');}}));
  assert.equal(weird.ok,false);
  const nullish=await fetchCarrierReconciliation(row,env,async()=>new Response('null'));
  assert.equal(nullish.ok,false);
});

test('contradictory inbound detail and list evidence never unlocks a reservation',async()=>{
  const listed={...inbound};
  const variants=[
    {...listed,status:'ringing'},
    {...listed,charge:0.09},
    {...listed,to:'+13125550111'},
    {...listed,from:'+12125550999'},
    {...listed,direction:'outbound'},
    {...listed,charge:undefined}
  ];
  for(const conflict of variants){
    const result=await fetchCarrierReconciliation(row,env,
      provider(inbound,[conflict,child]).fetchImpl);
    assert.equal(result.code,'CONFLICTING_INBOUND_CARRIER_LOGS',JSON.stringify({conflict,result}));
    assert.equal(result.ok,false);
  }
  const matching=await fetchCarrierReconciliation(row,env,
    provider(inbound,[{...inbound},child]).fetchImpl);
  assert.equal(matching.ok,true,JSON.stringify(matching));
  // The list may omit the inbound detail record; that alone is not a contradiction.
  const omitted=await fetchCarrierReconciliation(row,env,provider(inbound,[child],COMPLETE_LINKS,false).fetchImpl);
  assert.equal(omitted.ok,false);
  assert.equal(omitted.code,'INBOUND_MISSING_FROM_CARRIER_LIST');
});

test('fractional-cent charges never undercount the reservation cap',async()=>{
  // 1.0000001 cents must be billed as 2 cents, not rounded down to 1.
  for(const [a,b,expected] of [
    [0.01,0.000000001,2],
    [0.005,0.005000001,2],
    [0.1,0.2,30],
    [0.0045,0.0085,2],
    [0,0,0],
    [1e-7,0,1]
  ]){
    const p=provider({...inbound,charge:a},[{...child,charge:b}]);
    const result=await fetchCarrierReconciliation({...row,max_cost_cents:expected},env,p.fetchImpl);
    assert.equal(result.ok,true,JSON.stringify({a,b,result}));
    assert.equal(result.actual_cost_cents,expected,JSON.stringify({a,b,result}));
    if(expected>0){
      const denied=await fetchCarrierReconciliation({...row,max_cost_cents:expected-1},env,p.fetchImpl);
      assert.equal(denied.code,'ACTUAL_CHARGE_EXCEEDS_RESERVED_CAP',JSON.stringify({a,b,denied}));
    }
  }
});

test('rejects inbound segment with a parent carrier leg',async()=>{
  const parent='78313c74-b321-4c08-a3ea-7123449130ab';
  const nested={...inbound,parent_id:parent};
  const result=await fetchCarrierReconciliation(row,env,provider(nested,[{...nested},child]).fetchImpl);
  assert.equal(result.code,'INBOUND_LOG_MISMATCH');
});
test('rejects contradictory inbound parent linkage across detail and list',async()=>{
  const root={...inbound,parent_id:null};
  const listed={...root,parent_id:'78313c74-b321-4c08-a3ea-7123449130ab'};
  const result=await fetchCarrierReconciliation(row,env,provider(root,[listed,child]).fetchImpl);
  assert.equal(result.code,'CONFLICTING_INBOUND_CARRIER_LOGS');
});

test('reservation creation clock-skew boundary is deterministic and never widens provider lookup silently',async()=>{
  const base=row.created_at;
  for(const skew of [-121,-120,-119,0,119,120,121]){
    const local={...row,created_at:base+skew};
    // Pagination links must attest to this iteration's exact query window.
    // A static fixture for the baseline timestamp is no longer valid when
    // the reservation creation time is deliberately skewed.
    const createdAfter=new Date((local.created_at-120)*1000).toISOString();
    const first='https://example-space.signalwire.com/api/voice/logs?page_size=1000&created_after='+encodeURIComponent(createdAfter);
    const p=provider(inbound,[child],{self:first,first});
    const result=await fetchCarrierReconciliation(local,env,p.fetchImpl);
    assert.equal(result.ok,true,JSON.stringify({skew,result}));
    assert.equal(p.calls.length,2);
    const url=new URL(p.calls[1].url);
    assert.equal(url.searchParams.get('created_after'),
      new Date((local.created_at-120)*1000).toISOString());
    assert.equal(url.searchParams.get('page_size'),'1000');
  }
  // A valid detail response cannot compensate for a missing inbound list row.
  // This simulates the provider excluding the inbound row due to timestamp skew.
  const missing=provider(inbound,[child],COMPLETE_LINKS,false);
  const locked=await fetchCarrierReconciliation(row,env,missing.fetchImpl);
  assert.equal(locked.code,'INBOUND_MISSING_FROM_CARRIER_LIST');
  assert.equal(locked.ok,false);
});

test('high-volume unrelated Voice Logs preserve the completeness boundary',async()=>{
  const unrelated=Array.from({length:998},(_,i)=>({
    id:'78313c74-b321-4c08-a3ea-'+i.toString(16).padStart(12,'0'),parent_id:null,direction:'outbound',
    to:'+13125550100',status:'completed',charge:0.01
  }));
  // 999 unrelated records plus the two expected legs cannot fit one page.
  const full=provider(inbound,[child,...unrelated],COMPLETE_LINKS);
  const denied=await fetchCarrierReconciliation(row,env,full.fetchImpl);
  assert.equal(denied.code,'INCOMPLETE_CARRIER_PAGINATION');
  // A continuation link is never silently ignored, even for a short page.
  const paginated=provider(inbound,[child,...unrelated.slice(0,3)],
    {...COMPLETE_LINKS,next:'https://example-space.signalwire.com/api/voice/logs?page_number=2'});
  const locked=await fetchCarrierReconciliation(row,env,paginated.fetchImpl);
  assert.equal(locked.code,'PAGINATED_CARRIER_LOGS');
  assert.equal(paginated.calls.length,2,'must not follow provider-supplied cursor with credentials');
});

test('pagination metadata cannot falsely claim a complete first-page ledger',async()=>{
  const base='https://example-space.signalwire.com/api/voice/logs';
  const invalid=[
    {...COMPLETE_LINKS,self:'https://attacker.example/api/voice/logs'},
    {...COMPLETE_LINKS,first:'http://example-space.signalwire.com/api/voice/logs'},
    {...COMPLETE_LINKS,self:base+'/other'},
    {...COMPLETE_LINKS,self:base+'?page_number=1'},
    {...COMPLETE_LINKS,first:base+'?page_number=2'},
    {...COMPLETE_LINKS,self:base+'?page_number=0&page_number=1'},
    {...COMPLETE_LINKS,self:base+'?page_size=1'},
    // A same-origin first-page URL with an extra filter/cursor is not proof
    // of a complete ledger, even if the known filters are otherwise correct.
    {...COMPLETE_LINKS,self:base+'?page_size=1000&status=completed'},
    {...COMPLETE_LINKS,first:base+'?page_number=0&page_token=next'},
    {...COMPLETE_LINKS,self:base+'?page=2'},
    {...COMPLETE_LINKS,first:base+'?created_before=2020-01-01'},
    {...COMPLETE_LINKS,self:base+'?page_size=1000&to=%2B12125550100'},
    {...COMPLETE_LINKS,first:base+'?page_size=1000&page_size=1000'},
    {...COMPLETE_LINKS,self:base+'?created_after=2020-01-01T00%3A00%3A00Z'},
    {...COMPLETE_LINKS,first:base+'?created_after=2020-01-01T00%3A00%3A00Z&created_after=2020-01-01T00%3A00%3A00Z'},
    {...COMPLETE_LINKS,self:'https://user:pass@example-space.signalwire.com/api/voice/logs'},
    {...COMPLETE_LINKS,first:base+'#fragment'},
    {...COMPLETE_LINKS,first:'not a url'}
  ];
  for(const links of invalid){
    const p=provider(inbound,[child],links);
    const result=await fetchCarrierReconciliation(row,env,p.fetchImpl);
    assert.equal(result.code,'INCOMPLETE_CARRIER_PAGINATION',JSON.stringify({links,result}));
    assert.equal(p.calls.length,2,'must not follow untrusted pagination metadata');
  }
  for(const links of [
    {...COMPLETE_LINKS,self:COMPLETE_LINKS.self+'&page_number=0'},
    {...COMPLETE_LINKS,first:COMPLETE_LINKS.first+'&page_number=0'},
    {...COMPLETE_LINKS,self:base+'?page_size=1000&created_after='+encodeURIComponent(new Date((row.created_at-120)*1000).toISOString())}
  ]){
    const result=await fetchCarrierReconciliation(row,env,provider(inbound,[child],links).fetchImpl);
    assert.equal(result.ok,true,JSON.stringify({links,result}));
  }
});


test('UUID case variants cannot conceal extra direct or nested billable legs',async()=>{
  const extra={...child,id:'68313c74-b321-4c08-a3ea-7123449130ab',
    parent_id:SEG.toUpperCase(),charge:0.5};
  const direct=await fetchCarrierReconciliation(row,env,
    provider(inbound,[child,extra]).fetchImpl);
  assert.equal(direct.code,'UNVERIFIED_OUTBOUND_LEGS',JSON.stringify(direct));
  const grandchild={...child,id:'88313c74-b321-4c08-a3ea-7123449130ab',
    parent_id:CHILD.toUpperCase(),charge:0.5};
  const nested=await fetchCarrierReconciliation(row,env,
    provider(inbound,[child,grandchild]).fetchImpl);
  assert.equal(nested.code,'UNVERIFIED_NESTED_OUTBOUND_LEGS',JSON.stringify(nested));
  // The provider may capitalize an otherwise identical UUID in the detail
  // or child parent reference. Case alone must not create a false missing leg.
  const upperDetail={...inbound,id:SEG.toUpperCase()};
  const accepted=await fetchCarrierReconciliation(row,env,
    provider(upperDetail,[{...inbound}, {...child,parent_id:SEG.toUpperCase()}]).fetchImpl);
  assert.equal(accepted.ok,true,JSON.stringify(accepted));
  const upperChild={...child,id:CHILD.toUpperCase()};
  const nestedUpper=await fetchCarrierReconciliation(row,env,
    provider(inbound,[upperChild,{...grandchild,parent_id:CHILD}]).fetchImpl);
  assert.equal(nestedUpper.code,'UNVERIFIED_NESTED_OUTBOUND_LEGS',JSON.stringify(nestedUpper));
});

test('pagination links must attest to the exact requested time window and page size',async()=>{
  const base='https://example-space.signalwire.com/api/voice/logs';
  const cases=[
    {...COMPLETE_LINKS,self:base+'?page_size=1000'},
    {...COMPLETE_LINKS,first:base+'?created_after='+encodeURIComponent(new Date((row.created_at-120)*1000).toISOString())},
    {...COMPLETE_LINKS,self:base},
    {...COMPLETE_LINKS,last:base+'?page_number=0'},
    {...COMPLETE_LINKS,self:COMPLETE_LINKS.self+'&created_after='+encodeURIComponent(new Date((row.created_at-120)*1000).toISOString())},
    {...COMPLETE_LINKS,first:COMPLETE_LINKS.first+'&page_size=1000'}
  ];
  for(const links of cases){
    const p=provider(inbound,[child],links);
    const result=await fetchCarrierReconciliation(row,env,p.fetchImpl);
    assert.equal(result.code,'INCOMPLETE_CARRIER_PAGINATION');
    assert.equal(p.calls.length,2);
  }
  assert.equal((await fetchCarrierReconciliation(row,env,provider().fetchImpl)).ok,true);
});

test('reverse and terminal pagination metadata cannot contradict a single-page ledger',async()=>{
  const base='https://example-space.signalwire.com/api/voice/logs';
  for(const links of [
    {...COMPLETE_LINKS,prev:base+'?page_number=0'},
    {...COMPLETE_LINKS,prev:''},
    {...COMPLETE_LINKS,prev:false},
    {...COMPLETE_LINKS,last:base+'?page_number=1'},
    {...COMPLETE_LINKS,last:'https://other.example/api/voice/logs'},
    {...COMPLETE_LINKS,last:base+'?status=completed'},
    {...COMPLETE_LINKS,last:base+'?page_number=0'}
  ]){
    const p=provider(inbound,[child],links);
    const result=await fetchCarrierReconciliation(row,env,p.fetchImpl);
    // An explicit last-page marker must agree with self's page marker.
    assert.equal(result.code,'INCOMPLETE_CARRIER_PAGINATION',JSON.stringify({links,result}));
    assert.equal(p.calls.length,2,'never follow carrier-supplied links');
  }
  for(const links of [
    {...COMPLETE_LINKS,prev:null,last:COMPLETE_LINKS.self},
    {...COMPLETE_LINKS,prev:null,last:null},
    {...COMPLETE_LINKS,last:COMPLETE_LINKS.self}
  ]){
    const result=await fetchCarrierReconciliation(row,env,provider(inbound,[child],links).fetchImpl);
    assert.equal(result.ok,true,JSON.stringify({links,result}));
  }
});

test('equivalent first-page last links normalize absent page_number to zero',async()=>{
  const base=COMPLETE_LINKS.self;
  for(const [self,last,expected] of [
    [base,base+'&page_number=0',true],
    [base+'&page_number=0',base,true],
    [base+'&page_number=0',base+'&page_number=0',true],
    [base,base+'&page_number=1',false],
    [base+'&page_number=0',base+'&page_number=1',false],
    [base,base+'&page_number=0&page_number=0',false]
  ]){
    const p=provider(inbound,[child],{...COMPLETE_LINKS,self,last});
    const result=await fetchCarrierReconciliation(row,env,p.fetchImpl);
    assert.equal(result.ok,expected,JSON.stringify({self,last,result}));
    if(!expected)assert.equal(result.code,'INCOMPLETE_CARRIER_PAGINATION');
    assert.equal(p.calls.length,2,'never follow metadata links');
  }
});
