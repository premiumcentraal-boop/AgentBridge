/**
 * Stateless JSON-RPC 2.0 envelope validation for AgentBridge's HTTP MCP endpoint.
 * This gate must run BEFORE tool dispatch to prevent accidental paid side effects.
 */
const METHODS=new Set(['initialize','ping','tools/list','tools/call','notifications/initialized']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const E164=/^\+[1-9]\d{7,14}$/;
const KEYS=/^[A-Za-z0-9_.:-]{8,96}$/;

export function validateMcpEnvelope(input){
  if(input===null||typeof input!=='object'||Array.isArray(input))
    return {ok:false,code:-32600,message:'Expected one JSON-RPC object, not a batch or scalar'};
  if(input.jsonrpc!=='2.0'||typeof input.method!=='string')
    return {ok:false,code:-32600,message:'JSON-RPC 2.0 and a method are required'};
  if(!METHODS.has(input.method))
    return {ok:false,code:-32601,message:'Method not found'};
  const notification=input.method==='notifications/initialized';
  const hasId=Object.prototype.hasOwnProperty.call(input,'id');
  if(notification&&hasId)return {ok:false,code:-32600,message:'Notifications must not contain an id'};
  if(!notification&&(!hasId||!(typeof input.id==='string'||(typeof input.id==='number'&&Number.isSafeInteger(input.id)))))
    return {ok:false,code:-32600,message:'Requests require a string or integer id'};
  if(input.params!==undefined&&(input.params===null||typeof input.params!=='object'||Array.isArray(input.params)))
    return {ok:false,code:-32602,message:'Params must be an object'};
  if(input.method==='tools/call'){
    if(typeof input.params?.name!=='string')return {ok:false,code:-32602,message:'Tool name is required'};
    if(!['prepare_international_call','get_call_status','cancel_international_call'].includes(input.params.name))
      return {ok:false,code:-32601,message:'Unknown tool'};
    const args=input.params.arguments;
    if(args===null||typeof args!=='object'||Array.isArray(args))
      return {ok:false,code:-32602,message:'Tool arguments must be an object'};
    if(input.params.name==='prepare_international_call'){
      if(!E164.test(args.destination||'')||typeof args.destination!=='string'||!KEYS.test(args.idempotency_key||'')||typeof args.idempotency_key!=='string')
        return {ok:false,code:-32602,message:'Valid E.164 destination and idempotency key required'};
      if(Object.keys(args).some(k=>!['destination','idempotency_key'].includes(k)))
        return {ok:false,code:-32602,message:'Unexpected tool arguments'};
    }else{
      if(typeof args.reservation_id!=='string'||!UUID.test(args.reservation_id)||Object.keys(args).some(k=>k!=='reservation_id'))
        return {ok:false,code:-32602,message:'Valid reservation_id required'};
    }
  }
  return {ok:true,notification};
}
