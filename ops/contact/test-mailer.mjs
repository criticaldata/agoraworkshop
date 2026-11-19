import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code = stripTypeScriptTypes(readFileSync(new URL('./portfolio-mailer.ts', import.meta.url), 'utf8'));
function app(provider = { ok: true, id: 'mock-only' }) {
  let handler, payloads = [];
  const context = { Request, Response, URL, TextDecoder, Uint8Array, AbortSignal,
    console: { log() {}, error() {} }, setTimeout() {},
    Bun: { env: { RESEND_API_KEY: 'mock-secret', RESEND_FROM: 'mock@example.invalid', MAILER_SECRET: 'mock-private', MENTORING_TO: 'mentoring@example.invalid' }, serve(config) { handler = config.fetch; } },
    fetch: async (url, options) => { assert.equal(url, 'https://api.resend.com/emails'); payloads.push(JSON.parse(options.body)); return Response.json(provider.id ? { id: provider.id } : {}, { status: provider.ok ? 200 : 500 }); },
  };
  vm.runInNewContext(code, context);
  return { handler, payloads };
}
const base = { name: 'Example visitor', email: 'visitor@example.invalid', topic: 'joining', message: 'I would like to learn about AGORA.', website: '' };
const request = (body = base, ip = '192.0.2.1', origin = 'https://criticaldata.github.io') => new Request('https://example.invalid/agora/contact', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });
{
 const a=app(); const r=await a.handler(request());assert.equal(r.status,200);assert.equal((await r.json()).ok,true);assert.deepEqual(a.payloads[0].to,['simon@denemlabs.com','isaac.gavilanes@yachaytech.edu.ec']);assert.equal(a.payloads[0].reply_to,base.email);assert.equal(r.headers.get('access-control-allow-origin'),'https://criticaldata.github.io');
}
for (const body of [{...base,to:'attacker@example.invalid'}, {...base,email:'bad\nBcc: bad@example.invalid'}, {...base,name:'Name\nInjected'}, {...base,website:'bot'}, {...base,topic:'other'}, {...base,message:'short'}, {...base,message:'x'.repeat(15000)}, [], null]) {
 const a=app();const r=await a.handler(request(body));assert.ok([400,413].includes(r.status));assert.equal(a.payloads.length,0);
}
{
 const a=app();assert.equal((await a.handler(request(base,'192.0.2.1','https://evil.invalid'))).status,403);assert.equal(a.payloads.length,0);
 const preflight=await a.handler(new Request('https://example.invalid/agora/contact',{method:'OPTIONS',headers:{origin:'https://criticaldata.github.io'}}));assert.equal(preflight.status,204);
 assert.equal((await a.handler(new Request('https://example.invalid/send',{method:'POST'}))).status,401);
}
{
 const a=app();for(let i=0;i<3;i++)assert.equal((await a.handler(request())).status,200);assert.equal((await a.handler(request())).status,429);assert.equal(a.payloads.length,3);
}
{
 const a=app();for(let i=0;i<30;i++)assert.equal((await a.handler(request(base,`192.0.2.${i}`))).status,200);assert.equal((await a.handler(request(base,'192.0.2.200'))).status,429);assert.equal(a.payloads.length,30);
}
for(const provider of [{ok:false,id:null},{ok:true,id:null}]){const a=app(provider);assert.equal((await a.handler(request())).status,502);}
{
 const a=app();const r=await a.handler(new Request('https://example.invalid/send',{method:'POST',headers:{authorization:'Bearer mock-private','content-type':'application/json'},body:JSON.stringify({name:'Existing visitor',email:'existing@example.invalid',topic:'Mentoring',experience:'Example experience',project:'Example project'})}));assert.equal(r.status,200);assert.deepEqual(a.payloads[0].to,['mentoring@example.invalid']);
}
console.log('PASS: fixed recipients, reply-to, input/header limits, CORS, honeypot, IP/global limits, provider failures, and existing authenticated mentoring route. All provider calls mocked; no email sent.');
