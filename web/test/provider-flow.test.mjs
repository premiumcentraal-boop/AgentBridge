import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { JSDOM, VirtualConsole } from "jsdom";
import { openAccountDatabase } from "../../server/accounts/node-database.mjs";
import { createAccountService } from "../../server/accounts/service.mjs";
import { signalWireFixture } from "../../server/test/helpers/signalwire-fixture.mjs";
import { digest } from '../../server/accounts/auth-primitives.mjs';
const origin = "https://provider.agentbridge.test",
  email = "tester@example.com";
const html = (
  await readFile(
    new URL("../.cache/AgentBridge-Working-Website.html", import.meta.url),
    "utf8",
  )
)
  .replace(/<style>[\s\S]*?<\/style>/g, "")
  .replace(
    'data-offline="true"',
    'data-offline="false" data-account-demo="true"',
  );
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check) {
  for (let i = 0; i < 300; i++) {
    if (await check()) return;
    await pause(10);
  }
  assert.ok(await check(), "Expected live provider UI state was not reached");
}
function named(root, name, tag = "button") {
  const el = [...root.querySelectorAll(tag)].find(
    (n) => (n.getAttribute("aria-label") || n.textContent).trim() === name,
  );
  assert.ok(el, "Missing " + tag + ": " + name);
  return el;
}
function field(root, name) {
  const label = [...root.querySelectorAll("label[for]")].find((n) =>
    n.textContent.trim().startsWith(name),
  );
  assert.ok(label, "Missing field: " + name);
  return (root.ownerDocument || root).getElementById(label.htmlFor);
}
function set(window, input, value) {
  const proto =
    input.tagName === "SELECT"
      ? window.HTMLSelectElement.prototype
      : input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value);
  input.dispatchEvent(
    new window.Event(input.tagName === "SELECT" ? "change" : "input", {
      bubbles: true,
    }),
  );
}
function browser(t, fetcher, path) {
  const errors = [],
    console = new VirtualConsole();
  console.on("jsdomError", (e) => {
    if (
      e.type !== "css-parsing" &&
      !(e.type === "not-implemented" && /navigation/i.test(e.message))
    )
      errors.push(e);
  });
  console.on("error", (...args) => errors.push(new Error(args.join(" "))));
  const dom = new JSDOM(html, {
    url: origin + path,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: console,
    beforeParse(window) {
      window.fetch = fetcher;
      window.matchMedia = () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      });
      window.scrollTo = () => {};
      window.CSS = {
        escape: (value) =>
          String(value).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c),
        supports: () => false,
      };
      window.HTMLElement.prototype.scrollIntoView = () => {};
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
      window.HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute("open", "");
      };
      window.HTMLDialogElement.prototype.close = function () {
        this.removeAttribute("open");
        this.dispatchEvent(new window.Event("close"));
      };
      window.HTMLMediaElement.prototype.play = () => Promise.resolve();
      window.HTMLMediaElement.prototype.pause = () => {};
      if (!window.crypto.randomUUID) window.crypto.randomUUID = randomUUID;
    },
  });
  t.after(() => dom.window.close());
  return { dom, window: dom.window, document: dom.window.document, errors };
}
test('the account-backed Agents page remains accessible in live mode, saves a canonical contact and revokes app access',async t=>{
 const database=openAccountDatabase(':memory:');t.after(()=>database.close());const provider=signalWireFixture();
 const service=createAccountService({database,testerEmail:email,publicOrigin:origin,platformIdentity:true,vaultKey:randomBytes(32).toString('hex'),fetcher:provider.fetcher});
 const fetcher=async(path,options={})=>service.fetch(new Request(new URL(path,origin),{...options,headers:{...Object.fromEntries(new Headers(options.headers)),Origin:origin,'oai-authenticated-user-id':'verified-tester','oai-authenticated-user-email':email}}));
 const post=(path,body)=>fetcher('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await post('auth/register',{email,name:'Tester',agent_name:'Agent'})).status,201);
 await post('studio/provider/credentials',provider.config());await fetcher('/api/studio/provider/mode',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({live_enabled:true})});
 const account=await database.first('SELECT id FROM ab_accounts'),clientId=randomUUID(),grantId=randomUUID();
 await database.batch([
  {sql:'INSERT INTO ab_agent_clients(client_id,metadata,created_at) VALUES(?,?,?)',params:[clientId,JSON.stringify({client_name:'My Grok',redirect_uris:['https://client.example/callback']}),Date.now()]},
  {sql:'INSERT INTO ab_agent_grants(id,account_id,client_id,scopes,resource,created_at) VALUES(?,?,?,?,?,?)',params:[grantId,account.id,clientId,'contacts:read',origin+'/mcp',Date.now()]},
 ]);
 const view=browser(t,fetcher,'/studio/agents/'),{document,window}=view;
 await until(()=>document.querySelector('.agent-contact-list'));
 assert.match(document.querySelector('main').textContent,/My Grok/);
 named(document,'Add contact').click();await until(()=>document.querySelector('dialog[open]'));
 const dialog=document.querySelector('dialog[open]');set(window,field(dialog,'Name'),'Alex');set(window,field(dialog,'Phone number'),'+1 (202) 555-0123');set(window,field(dialog,'Notes'),'Prefers afternoon calls.');
 named(dialog,'Save contact').click();await until(()=>document.querySelector('.agent-contact-list').textContent.includes('Alex'));
 assert.match(document.querySelector('.agent-contact-list').textContent,/\+12025550123/);
 named(document,'Disconnect').click();await until(async()=>Boolean((await database.first('SELECT revoked_at FROM ab_agent_grants WHERE id=?',[grantId])).revoked_at));
 assert.equal(provider.posts().length,0);assert.deepEqual(view.errors,[]);
});

test('rendered OAuth consent shows the client permissions and completes approval in the signed-in account',async t=>{
 const database=openAccountDatabase(':memory:');t.after(()=>database.close());
 const account=randomUUID(),session=randomBytes(32).toString('hex'),client=randomUUID(),requestId=randomUUID(),stamp=new Date().toISOString();
 await database.batch([
  {sql:'INSERT INTO ab_accounts(id,email,name,agent_name,auth_provider,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',params:[account,email,'Tester','Agent','password',stamp,stamp]},
  {sql:'INSERT INTO ab_sessions(token_hash,account_id,expires_at,created_at) VALUES(?,?,?,?)',params:[await digest(session),account,Date.now()+3600000,stamp]},
  {sql:'INSERT INTO ab_workspaces(account_id,revision,document,updated_at) VALUES(?,0,?,?)',params:[account,JSON.stringify({routing_numbers:[],connections:[],call_plans:[],call_history:[],settings:{experience:'simple'},capture_preferences:{},demo_call:{active:false}}),stamp]},
  {sql:'INSERT INTO ab_agent_clients(client_id,metadata,created_at) VALUES(?,?,?)',params:[client,JSON.stringify({client_name:'Grok Bot',redirect_uris:['https://client.example/callback']}),Date.now()]},
  {sql:'INSERT INTO ab_agent_requests(id,client_id,payload,expires_at) VALUES(?,?,?,?)',params:[requestId,client,JSON.stringify({redirectUri:'https://client.example/callback',codeChallenge:'a'.repeat(43),scopes:['contacts:read','history:read','calls:prepare'],state:'test-state'}),Date.now()+600000]},
 ]);
 const service=createAccountService({database,testerEmail:email,publicOrigin:origin,agentExternal:true});
 const fetcher=(path,options={})=>service.fetch(new Request(new URL(path,origin),{...options,headers:{...Object.fromEntries(new Headers(options.headers)),Origin:origin,Cookie:'ab_customer='+session}}));
 const view=browser(t,fetcher,'/studio/agents/?authorize='+requestId),{document}=view;
 await until(()=>document.querySelector('[aria-label="Connect agent request"]'));
 const panel=document.querySelector('[aria-label="Connect agent request"]');assert.match(panel.textContent,/Grok Bot/);assert.match(panel.textContent,/client.example/);assert.equal(panel.querySelectorAll('input[type="checkbox"]:checked').length,3);
 named(panel,'Connect app').click();await until(async()=>Boolean(await database.first('SELECT id FROM ab_agent_grants')));
 const grant=await database.first('SELECT account_id,scopes FROM ab_agent_grants');assert.equal(grant.account_id,account);assert.equal(grant.scopes,'contacts:read history:read calls:prepare');assert.deepEqual(view.errors,[]);
});

test('a completed call can be explicitly transcribed and its saved text removed through the rendered studio',async t=>{
 const database=openAccountDatabase(':memory:');t.after(()=>database.close());const provider=signalWireFixture();let asr=0;
 const service=createAccountService({database,testerEmail:email,publicOrigin:origin,platformIdentity:true,vaultKey:randomBytes(32).toString('hex'),fetcher:async(url,options)=>{
  if(url==='https://api.x.ai/v1/stt'){asr++;assert.equal(options.body.get('file').size,5);return Response.json({text:'The appointment is confirmed for Tuesday.',language:'en',duration:20});}
  return provider.fetcher(url,options);
 }});
 const fetcher=(path,options={})=>service.fetch(new Request(new URL(path,origin),{...options,headers:{...Object.fromEntries(new Headers(options.headers)),Origin:origin,'oai-authenticated-user-id':'verified-tester','oai-authenticated-user-email':email}}));
 const write=async(path,body,method='POST')=>{const response=await fetcher('/api/'+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.ok(response.ok,await response.clone().text());return response.json();};
 await write('auth/register',{email,name:'Tester',agent_name:'Agent'});await write('studio/provider/credentials',provider.config());await write('studio/provider/mode',{live_enabled:true},'PATCH');
 const {number}=await write('studio/live/numbers/import',{provider_number_id:provider.owned.id,label:'Office'});await write('studio/live/connections',{label:'Alex',country:'US',destination:'+12025550123',routing_number_id:number.id});
 const call={sid:randomUUID(),account_sid:provider.state.project,phone_number_sid:provider.owned.id,from:provider.owned.number,to:'+12025550123',status:'completed',direction:'outbound-api',duration:20,date_created:new Date().toISOString()};provider.state.calls.push(call);
 provider.state.recordings.push({sid:randomUUID(),account_sid:provider.state.project,call_sid:call.sid,status:'completed',duration:20});
 await write('studio/live/sync',{});await write('studio/transcription/settings',{api_key:'test-only-xai-ui-key'},'PUT');
 const view=browser(t,fetcher,'/studio/calls/'),{document}=view;
 await until(()=>document.querySelector('.conversation-history-row'));named(document,'Open recent call with Alex').click();
 await until(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Transcribe recording'));named(document,'Transcribe recording').click();
 await until(()=>document.querySelector('dialog[open][aria-label="Transcribe recording"]'));const dialog=document.querySelector('dialog[open][aria-label="Transcribe recording"]');
 assert.equal(asr,0);assert.equal(named(dialog,'Transcribe').disabled,true);dialog.querySelector('input[type="checkbox"]').click();named(dialog,'Transcribe').click();
 await until(()=>document.querySelector('.live-transcript')?.textContent.includes('Tuesday'));assert.equal(asr,1);
 named(document,'Remove saved transcript').click();await until(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Delete transcript'));named(document,'Delete transcript').click();await until(async()=>(await database.first('SELECT COUNT(*) AS n FROM ab_transcription_jobs')).n===0);
 assert.deepEqual(view.errors,[]);
});
test("the rendered studio securely connects SignalWire, imports inventory, activates a destination and starts a real API callback request", async (t) => {
  const database = openAccountDatabase(":memory:");
  t.after(() => database.close());
  const provider = signalWireFixture();
  const service = createAccountService({
    database,
    testerEmail: email,
    publicOrigin: origin,
    platformIdentity: true,
    vaultKey: randomBytes(32).toString("hex"),
    fetcher: provider.fetcher,
  });
  const fetcher = async (path, options = {}) => {
    const url = new URL(path, origin);
    assert.equal(url.origin, origin);
    const headers = new Headers(options.headers);
    headers.set("Origin", origin);
    headers.set("oai-authenticated-user-id", "verified-tester");
    headers.set("oai-authenticated-user-email", email);
    return service.fetch(new Request(url, { ...options, headers }));
  };
  let response = await fetcher("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name: "Tester", agent_name: "Agent" }),
  });
  assert.equal(response.status, 201);
  const first = browser(t, fetcher, "/studio/settings/");
  let { window, document } = first;
  await until(
    () =>
      document.querySelector('.provider-settings input[type="password"]') &&
      !document.querySelector('.provider-settings input[type="password"]')
        .disabled,
  );
  set(window, field(document, "Space name"), provider.state.space);
  set(window, field(document, "Project ID"), provider.state.project);
  set(window, field(document, "API token"), provider.state.token);
  named(document, "Save and verify").click();
  await until(() => document.querySelector(".provider-mode"));
  assert.equal(field(document, "New API token").value, "");
  assert.ok(!document.documentElement.outerHTML.includes(provider.state.token));
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.sessionStorage.length, 0);
  assert.equal(provider.posts().length, 0);
  named(document, "Use my SignalWire project").click();
  await until(async () =>
    Boolean(
      (await database.first("SELECT live_enabled FROM ab_provider_connections"))
        ?.live_enabled,
    ),
  );
  first.dom.window.close();
  const second = browser(t, fetcher, "/studio/");
  ({ window, document } = second);
  await until(() => document.querySelector(".live-workspace"));
  assert.equal(
    document.querySelector(".account-demo-badge").textContent,
    "Live testing",
  );
  assert.equal(document.querySelector(".number-connection-card"), null);
  named(document, "Numbers", "a").click();
  await until(
    () =>
      document.querySelector(".live-page-heading h1")?.textContent ===
      "Your numbers",
  );
  named(document.querySelector("main"), "Get a number").click();
  await until(() =>
    document.querySelector(
      'dialog[open] .provider-number-list input[type="radio"]',
    ),
  );
  let dialog = document.querySelector("dialog[open]");
  dialog.querySelector('input[type="radio"]').click();
  set(window, field(dialog, "Number name"), "My SignalWire line");
  named(dialog, "Use this number").click();
  await until(() => !document.querySelector("dialog[open]"));
  assert.match(
    document.querySelector(".live-workspace").textContent,
    /\+12025551234/,
  );
  assert.equal(provider.posts().length, 0);
  named(document, "Connections", "a").click();
  await until(() =>
    document.querySelector('input[aria-label="Search live connections"]'),
  );
  named(document.querySelector("main"), "Connect destination").click();
  await until(() =>
    document.querySelector('dialog[open][aria-label="Add connection"]'),
  );
  dialog = document.querySelector("dialog[open]");
  set(window, field(dialog, "Name"), "London office");
  set(window, field(dialog, "Destination number"), "+442079460123");
  named(dialog, "Save connection").click();
  await until(
    () =>
      document.querySelector(".live-connection-card h2")?.textContent ===
      "London office",
  );
  assert.equal(provider.posts().length, 0);
  named(document, "Activate forwarding").click();
  await until(() => document.querySelector("dialog[open] .provider-consent"));
  dialog = document.querySelector("dialog[open]");
  assert.equal(named(dialog, "Activate forwarding").disabled, true);
  dialog.querySelector('input[type="checkbox"]').click();
  named(dialog, "Activate forwarding").click();
  await until(() => !document.querySelector("dialog[open]"));
  assert.match(
    document.querySelector(".live-connection-card").textContent,
    /Forwarding on/,
  );
  assert.ok(provider.owned.call_request_url.includes("/laml-bins/"));
  named(document, "Test callback").click();
  await until(() => document.querySelector('dialog[open] input[type="tel"]'));
  dialog = document.querySelector("dialog[open]");
  set(window, field(dialog, "Your callback phone"), "+12125551234");
  dialog.querySelector('input[type="checkbox"]').click();
  named(dialog, "Start a test call").click();
  await until(() => provider.state.calls.length === 1);
  await until(() => !document.querySelector("dialog[open]"));
  assert.equal(provider.state.calls[0].status, "queued");
  named(document, "Calls", "a").click();
  await until(() => document.querySelector(".live-call-card"));
  assert.match(document.querySelector(".live-call-card").textContent, /queued/);
  assert.equal(document.querySelector(".sample-listen-dock"), null);
  assert.deepEqual(
    first.errors.map((e) => e.message),
    [],
  );
  assert.deepEqual(
    second.errors.map((e) => e.message),
    [],
  );
  second.dom.window.close();
});
