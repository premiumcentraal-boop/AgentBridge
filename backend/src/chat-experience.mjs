/**
 * Read-only chat-first call-experience preview.
 *
 * User-selected "difficulty" changes presentation only. It never alters
 * caller authentication, carrier permission, approvals, rates or spend caps.
 * No state is stored, no call is prepared, and no telephony API is contacted.
 */
export const CALL_DIFFICULTIES=Object.freeze(['simple','guided','advanced']);
export const REQUIRED_GATES=Object.freeze([
  'Verify that the native Grok Bot call and bridge use are permitted by current platform and carrier terms.',
  'Authenticate the account and verify destination, consent and allowed routing.',
  'Obtain an independently verified rate and enforce server-side spending and duration limits.',
  'Require separate owner approval and the configured caller proof: a one-use DTMF PIN by default; caller-ID or any-caller modes are owner opt-ins with documented residual risk.',
  'Require the user to approve the native Grok Bot call before any dialing.'
]);

const LEVELS=Object.freeze({
  simple:{
    title:'Simple: only the essentials',
    steps:[
      'Tell Grok Bot who to call and ask it to check AgentBridge.',
      'Review the destination and maximum cost; approve the route through the authorized owner flow.',
      'If eligible, approve Grok Bot’s own Call action and complete any required caller challenge.'
    ],
    sample_message:'Help me arrange a permitted call through AgentBridge. Keep it simple; show the destination and maximum cost, and ask before any call.'
  },
  guided:{
    title:'Guided: explain each step',
    steps:[
      'Check whether my Grok Bot account, the intended recipient and the telecom provider permit this call.',
      'Verify the destination, consent, carrier rate, budget and call-duration limit.',
      'Explain the independent owner approval and caller verification steps.',
      'Wait for the native Grok Bot Call confirmation. Explain the outcome or why the request was blocked.'
    ],
    sample_message:'Guide me through an AgentBridge call step by step. Explain eligibility, costs and each required approval before dialing.'
  },
  advanced:{
    title:'Advanced: show technical details',
    steps:[
      'Report platform eligibility, provider permissions, authenticated account and assigned DID state.',
      'Show E.164 validation, country restrictions, rate evidence, both-leg exposure and enforced caps.',
      'Show reservation TTL, idempotency, owner-approval digest, caller challenge and webhook replay gates.',
      'Do not dial until the native Grok Bot Call confirmation. Explain call and carrier-reconciliation states.'
    ],
    sample_message:'Show the technical AgentBridge call preflight, rate evidence, limits, authentication, replay safeguards and required approvals. Do not place a call.'
  }
});

export function previewChatCallFlow(input={}){
  if(input===null||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).some(k=>k!=='difficulty'))
    return {status:422,body:{error:{code:'INVALID_CHAT_PREFERENCES',message:'Only an optional difficulty is supported.'}}};
  const difficulty=input.difficulty??'simple';
  if(typeof difficulty!=='string'||!CALL_DIFFICULTIES.includes(difficulty))
    return {status:422,body:{error:{code:'INVALID_DIFFICULTY',message:'Choose simple, guided or advanced.'}}};
  const level=LEVELS[difficulty];
  return {status:200,body:{
    card_type:'call_experience_preview',
    state:'preview_only',
    title:level.title,
    difficulty,
    difficulty_options:[...CALL_DIFFICULTIES],
    can_change_difficulty_in_chat:true,
    preference_scope:'this_tool_request_only',
    preference_saved:false,
    preferred_interface:'Grok Bot chat',
    steps:[...level.steps],
    sample_message:level.sample_message,
    required_gates:[...REQUIRED_GATES],
    owner_approval_out_of_band_required:true,
    native_call_requires_user_confirmation:true,
    ready_to_call:false,
    routing_enabled:false,
    payment_enabled:false,
    live_rate_verified:false,
    grok_bot_native_call_compatibility_verified:false,
    international_bridge_use_permitted:false,
    warning:'Preview only. Grok Bot calling terms currently describe US-only calls. A US access number must not be used to evade platform calling restrictions. Live international routing, in-chat owner approval, PIN automation and durable preferences are not implemented.'
  }};
}
