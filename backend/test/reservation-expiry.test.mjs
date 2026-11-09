import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareReservation,sha256} from '../src/index.mjs';
import worker from '../src/index.mjs';

const did='+12025550123',destination='+31201234567',key='expiry-test-123';
const account={id:'account-1',did,status:'active'};
const token='ab_'+('x'.repeat(45));
function fakeDb(now,row){
  const queries=[];
  const DB={prepare(sql){
    const query={sql,args:[],bind(...args){this.args=args;return this;},
      async first(){
        if(sql.includes('idempotency_key=?'))return row;
        if(sql.includes('WHERE id=? AND account_id=?'))return row;
        if(sql.includes('status IN'))return null;
        if(sql.includes('COUNT(*)'))return {n:0};
        if(sql.includes('api_key_sha256'))return account;
        return null;
      },
      async run(){return {meta:{changes:1}};}
    };
    queries.push(query);return query;
  }};
  return {DB,queries};
}
test('idempotent expired reservation returns terminal conflict without access number',async()=>{
  const now=Math.floor(Date.now()/1000);
  const row={id:'11111111-1111-4111-8111-111111111111',destination,
    status:'ready',expires_at:now-1};
  const {DB,queries}=fakeDb(now,row);
  const result=await prepareReservation(account,{destination,idempotency_key:key},
    {DB,US_BRIDGE_DID:did,TEST_DESTINATION_E164:destination});
  assert.equal(result.status,409);
  assert.equal(result.body.error.code,'RESERVATION_EXPIRED');
  assert.equal(JSON.stringify(result).includes(did),false);
  assert.match(queries[0].sql,/expires_at <= \?/);
});
test('same idempotency key cannot reopen consumed or terminal reservations',async()=>{
  for(const status of ['connecting','completed','failed','expired','cancelled']){
    const row={id:'11111111-1111-4111-8111-111111111111',destination,
      status,expires_at:Math.floor(Date.now()/1000)+40};
    const result=await prepareReservation(account,{destination,idempotency_key:key},
      {DB:fakeDb(0,row).DB,US_BRIDGE_DID:did,TEST_DESTINATION_E164:destination});
    assert.equal(result.status,409);
    assert.equal(result.body.error.code,'RESERVATION_NOT_READY');
  }
});
test('unexpired same-key retry is safe and returns original route',async()=>{
  const row={id:'11111111-1111-4111-8111-111111111111',destination,
    status:'ready',expires_at:Math.floor(Date.now()/1000)+40};
  const result=await prepareReservation(account,{destination,idempotency_key:key},
    {DB:fakeDb(0,row).DB,US_BRIDGE_DID:did,TEST_DESTINATION_E164:destination});
  assert.equal(result.status,200);
  assert.equal(result.body.status,'ready');
  assert.equal(result.body.us_access_number,did);
});
test('REST GET never exposes an expired route as ready, even if D1 has stale ready state',async()=>{
  const row={id:'11111111-1111-4111-8111-111111111111',destination,
    status:'ready',expires_at:Math.floor(Date.now()/1000)-1};
  const {DB}=fakeDb(0,row);
  const result=await worker.fetch(new Request('https://api.example.com/v1/reservations/'+row.id,{
    headers:{authorization:'Bearer '+token}
  }),{DB,PUBLIC_BASE_URL:'https://api.example.com',US_BRIDGE_DID:did,
    TEST_DESTINATION_E164:destination,TEST_CALLER_E164:'+12125550177',TWILIO_AUTH_TOKEN:'unused'});
  assert.equal(result.status,200);
  const body=await result.json();
  assert.equal(body.status,'expired');
  assert.equal(body.us_access_number,null);
});
