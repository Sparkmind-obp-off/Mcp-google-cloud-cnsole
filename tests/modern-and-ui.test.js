import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createWorker } from '../worker/src/index.js';
import { handleModernMcp, MODERN_VERSION } from '../worker/src/mcp-modern.js';
import { dashboardScript } from '../worker/src/dashboard.js';
import { encrypt, random } from '../worker/src/security.js';
import { BILLING_SCOPE, READ_SCOPE, beginOAuth } from '../worker/src/oauth.js';
import { invokeRead, readTools } from '../worker/src/tools.js';

const user={id:'26a31f9f-9002-4535-b7ce-fdc2e9e97397'};
const connectionId='3712cbe6-00d8-4ce3-b4c4-b4d96a208fd8';
const meta={'io.modelcontextprotocol/protocolVersion':MODERN_VERSION,'io.modelcontextprotocol/clientCapabilities':{}};
const store={security:async()=>{},connections:async()=>[{id:connectionId}],projects:async()=>[],rate:async()=>{},user:async()=>user};
const env={DATABASE_URL:'postgresql://test:password@ep-test.us-east-2.aws.neon.tech/neondb?sslmode=require',APP_ORIGIN:'https://connector.test',GOOGLE_CLIENT_ID:'test-id',GOOGLE_CLIENT_SECRET:'test-secret',GOOGLE_REDIRECT_URI:'https://connector.test/oauth/google/callback',TOKEN_ENCRYPTION_KEY:random(),MCP_AUTH_ISSUER:'https://issuer.test',MCP_AUTH_AUDIENCE:'https://connector.test/mcp',MCP_AUTH_JWKS_URL:'https://issuer.test/jwks'};
function rpc(method,params={},headers={},id=1){
 const body={jsonrpc:'2.0',...(id===undefined?{}:{id}),method,params:{_meta:meta,...params}};
 const request=new Request(`${env.APP_ORIGIN}/mcp`,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':MODERN_VERSION,'mcp-method':method,...(params.name?{'mcp-name':params.name}:{}),...headers},body:JSON.stringify(body)});
 return {request,body};
}
const call=async(method,params,headers,id)=>{const {request,body}=rpc(method,params,headers,id);return handleModernMcp(request,body,user,env,store);};

test('modern server/discover advertises version, identity and only actual capabilities',async()=>{
 const response=await call('server/discover');assert.equal(response.status,200);
 const {result}=await response.json();assert.equal(result.resultType,'complete');assert.ok(result.supportedVersions.includes(MODERN_VERSION));
 assert.deepEqual(result.capabilities,{tools:{listChanged:false}});assert.equal(result.cacheScope,'private');assert.equal(result.ttlMs,0);
 assert.equal(result._meta['io.modelcontextprotocol/serverInfo'].version,'0.3.0');
});
test('modern tools/list exposes strict JSON Schema and read-only annotations',async()=>{
 const result=(await(await call('tools/list')).json()).result;
 assert.equal(result.resultType,'complete');assert.ok(result.tools.some(t=>t.name==='gcp_list_billing_budgets'));
 assert.ok(result.tools.every(t=>t.inputSchema.additionalProperties===false&&t.annotations.readOnlyHint===true));
 assert.ok(!result.tools.some(t=>/approve|execute/.test(t.name)));
});
test('modern tools/call invokes same tenant-bound registry without legacy initialize',async()=>{
 const response=await call('tools/call',{name:'gcp_get_connection_status',arguments:{}});
 const body=await response.json();assert.equal(body.result.resultType,'complete');assert.equal(body.result.structuredContent.data[0].id,connectionId);
});
test('modern required metadata is checked independently on every request',async()=>{
 for(const missing of ['io.modelcontextprotocol/protocolVersion','io.modelcontextprotocol/clientCapabilities']){
   const copy={...meta};delete copy[missing];const response=await call('tools/list',{_meta:copy});
   assert.equal(response.status,400);assert.equal((await response.json()).error.code,-32602);
 }
});
test('modern header mismatch and missing name/method/version use HeaderMismatch',async()=>{
 for(const headers of [{'mcp-method':'ping'},{'mcp-name':''},{'mcp-protocol-version':'2025-11-25'}]){
   const response=await call('tools/call',{name:'gcp_get_connection_status',arguments:{}},headers);
   assert.equal(response.status,400);assert.equal((await response.json()).error.code,-32020);
 }
});
test('modern base64 sentinel name is decoded strictly; malformed values rejected',async()=>{
 const name='gcp_get_connection_status',encoded='=?base64?'+btoa(name)+'?=';
 assert.equal((await call('tools/call',{name,arguments:{}},{'mcp-name':encoded})).status,200);
 const response=await call('tools/call',{name,arguments:{}},{'mcp-name':'=?base64?%%%?='});
 assert.equal((await response.json()).error.code,-32020);
});
test('modern unsupported version lists supported versions; unknown method is HTTP404 JSONRPC',async()=>{
 const copy={...meta,'io.modelcontextprotocol/protocolVersion':'2099-01-01'};
 const version=await call('tools/list',{_meta:copy},{'mcp-protocol-version':'2099-01-01'});
 const error=(await version.json()).error;assert.equal(error.code,-32022);assert.ok(error.data.supported.includes(MODERN_VERSION));
 const response=await call('unknown/method');assert.equal(response.status,404);assert.equal((await response.json()).error.code,-32601);
});
test('modern notifications are 202 empty; null IDs and wrong Accept are rejected',async()=>{
 const item=rpc('notifications/message');delete item.body.id;
 const response=await handleModernMcp(item.request,item.body,user,env,store);assert.equal(response.status,202);assert.equal(await response.text(),'');
 const invalid=await call('tools/list',{}, {},null);assert.equal((await invalid.json()).error.code,-32600);
 assert.equal((await call('tools/list',{}, {accept:'application/json;q=0, text/event-stream'})).status,406);
});
test('modern malformed args and unknown tools do not become unbounded API requests',async()=>{
 const unknown=await call('tools/call',{name:'shell_exec',arguments:{cmd:'unsafe'}});assert.equal((await unknown.json()).error.code,-32602);
 const invalid=await call('tools/call',{name:'gcp_get_connection_status',arguments:{unexpected:true}});
 assert.equal((await invalid.json()).result.isError,true);
});
test('modern HTTP route preserves authentication and origin checks',async()=>{
 const worker=createWorker({store,verifyMcpToken:async()=>({payload:{sub:'test-sub',scope:'mcp:read'}})});
 const {request}=rpc('server/discover');assert.equal((await worker.fetch(request,env)).status,401);
 const valid=rpc('server/discover',{}, {authorization:'Bearer test-token'}).request;
 assert.equal((await worker.fetch(valid,env)).status,200);
 const evil=rpc('server/discover',{}, {authorization:'Bearer test-token',origin:'https://evil.test'}).request;
 assert.equal((await worker.fetch(evil,env)).status,403);
});

test('modern route emits JSON-RPC parse and invalid-envelope errors without leaking input',async()=>{
 const worker=createWorker({store,verifyMcpToken:async()=>({payload:{sub:'test-sub',scope:'mcp:read'}})});
 const headers={'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':MODERN_VERSION,authorization:'Bearer test-token'};
 const parse=await worker.fetch(new Request(`${env.APP_ORIGIN}/mcp`,{method:'POST',headers,body:'{'}),env);
 assert.equal((await parse.json()).error.code,-32700);
 const invalid=await worker.fetch(new Request(`${env.APP_ORIGIN}/mcp`,{method:'POST',headers,body:'[]'}),env);
 assert.equal((await invalid.json()).error.code,-32600);
 const info=await call('tools/list',{_meta:{...meta,'io.modelcontextprotocol/clientInfo':{name:99}}});
 assert.equal((await info.json()).error.code,-32602);
});

test('dashboard works without runtime secrets, has CSP and publishes no credential values',async()=>{
 const worker=createWorker();const response=await worker.fetch(new Request('https://connector.test/'),{});
 assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('Approval gate'));assert.ok(html.includes('Voice workspace'));
 assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));assert.ok(!/<script>/.test(html));
 const status=await worker.fetch(new Request('https://connector.test/api/status'),env);const values=await status.json();
 assert.equal(values.productionReady,false);assert.equal(values.writesEnabled,false);assert.equal(values.databaseConfigured,true);
 assert.ok(!JSON.stringify(values).includes(env.GOOGLE_CLIENT_SECRET));assert.ok(!JSON.stringify(values).includes(env.DATABASE_URL));
 new vm.Script(dashboardScript);
});
test('voice code contains no automatic tool invocation and starts microphone only after explicit click',()=>{
 assert.ok(dashboardScript.includes("byId('voice-start').addEventListener('click'"));
 const voiceCode=dashboardScript.slice(dashboardScript.indexOf('const Recognition='));
 assert.ok(!voiceCode.includes('fetch('));assert.ok(!voiceCode.includes('localStorage'));assert.ok(!voiceCode.includes('sessionStorage'));
});

test('voice browser adapter requests microphone only on click and never auto-sends a transcript',async()=>{
 const elements=new Map();const calls=[];let microphoneStarts=0,speaks=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',style:{},disabled:false,handlers:new Map(),addEventListener(event,fn){this.handlers.set(event,fn);}});return elements.get(id);};
 class Recognition{
   static latest;constructor(){Recognition.latest=this;this.handlers=new Map();}
   addEventListener(event,fn){this.handlers.set(event,fn);}start(){microphoneStarts++;}stop(){}abort(){}
 }
 const context={document:{getElementById:element},window:{SpeechRecognition:Recognition,addEventListener(){},speechSynthesis:{cancel(){},speak(){speaks++;}}},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},fetch:async url=>{calls.push(url);return{ok:false,json:async()=>url==='/health'?{ok:true}:{databaseConfigured:false,googleOAuthConfigured:false}};},crypto,URL,JSON};
 vm.runInNewContext(dashboardScript,context);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(microphoneStarts,0);assert.equal(speaks,0);
 element('voice-start').handlers.get('click')();assert.equal(microphoneStarts,1);
 Recognition.latest.handlers.get('result')({results:[[{transcript:'Hentikan mesin sekarang'}]]});
 assert.ok(element('voice-text').value.includes('Hentikan mesin sekarang'));
 assert.ok(!calls.some(url=>url.includes('mcp')||url.includes('operations')));
 element('voice-speak').handlers.get('click')();assert.equal(speaks,1);
});

test('budget tool is opt-in and requires real granted billing scope before network',async()=>{
 const tool=readTools.find(t=>t.budgetRead),args={connectionId,projectId:'sample-project'};
 const stub={project:async()=>({id:'project-row'}),connection:async()=>({scopes:[READ_SCOPE]})};
 const noNetwork=async()=>{throw Error('NETWORK_MUST_NOT_RUN')};
 await assert.rejects(invokeRead(tool,args,user,env,stub,noNetwork),/BUDGET_READ_NOT_ENABLED/);
 await assert.rejects(invokeRead(tool,args,user,{...env,ENABLE_BUDGET_READ:'true'},stub,noNetwork),/BILLING_SCOPE_REQUIRED/);
});
test('budget read derives account from selected project and excludes mixed/account-wide budgets',async()=>{
 const cipher=await encrypt(JSON.stringify({access_token:'test-access',refresh_token:'test-refresh'}),env.TOKEN_ENCRYPTION_KEY,`google-tokens:${user.id}:${connectionId}`);
 const row={id:connectionId,scopes:[READ_SCOPE,BILLING_SCOPE],encrypted_tokens:cipher,token_expires_at:new Date(Date.now()+3600000).toISOString()};
 const stub={project:async()=>({id:'project-row'}),connection:async()=>row,audit:async()=>{}};
 const urls=[];
 const fetcher=async url=>{urls.push(url);
   if(url.includes('/billingInfo'))return Response.json({billingAccountName:'billingAccounts/AAAAAA-BBBBBB-CCCCCC'});
   if(url.includes('cloudresourcemanager'))return Response.json({name:'projects/123456'});
   assert.ok(url.startsWith('https://billingbudgets.googleapis.com/v1/billingAccounts/AAAAAA-BBBBBB-CCCCCC/budgets?'));
   assert.equal(new URL(url).searchParams.get('scope'),'projects/sample-project');
   return Response.json({budgets:[{name:'selected',budgetFilter:{projects:['projects/123456']}},{name:'mixed',budgetFilter:{projects:['projects/123456','projects/other-project']}},{name:'all',budgetFilter:{}}]});
 };
 const data=await invokeRead(readTools.find(t=>t.budgetRead),{connectionId,projectId:'sample-project'},user,{...env,ENABLE_BUDGET_READ:'true'},stub,fetcher);
 assert.deepEqual(data.budgets.map(b=>b.name),['selected']);assert.equal(urls.length,3);
});
test('budget OAuth scope is never added to default read consent',async()=>{
 let captures=[];const stub={beginOAuth:async(...args)=>captures.push(args)};
 const normal=new URL((await beginOAuth(user,env,stub)).authorizationUrl);
 assert.ok(!normal.searchParams.get('scope').includes(BILLING_SCOPE));
 const opted=new URL((await beginOAuth(user,{...env,ENABLE_BUDGET_READ:'true'},stub)).authorizationUrl);
 assert.ok(opted.searchParams.get('scope').includes(BILLING_SCOPE));assert.equal(captures.length,2);
});
