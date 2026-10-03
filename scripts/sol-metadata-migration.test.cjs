/** Optional music metadata: offline real function, no music submission or provider requests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(options = {}) {
  const source = fs.readFileSync('src/app/api/generate/route.ts','utf8');
  const tree = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
  const node = tree.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'generateSongMetadata');
  assert.ok(node); const calls = []; const state = { cleared: 0 }; const module = { exports: {} };
  const content = { title:'새벽의 고양이', description:'고요한 새벽을 뒤집는 장난기 가득한 노래.', tags:'comedy, chiptune' };
  const script = ts.transpileModule(node.getText(tree) + '\nmodule.exports = generateSongMetadata;', { compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(script, { module, process:{ env:{ OPENAI_API_KEY:options.missingKey ? '' : 'offline-fixture' } }, AbortController,
    setTimeout(fn, ms) { assert.equal(ms,15000); return 1; }, clearTimeout() { state.cleared++; }, console:{ log(){}, warn(){} },
    fetch: async(url, config) => {
      calls.push({url,...config, body:JSON.parse(config.body)});
      if(options.network) throw new Error('PRIVATE_BODY');
      return new Response(JSON.stringify({ model:options.model || 'gpt-5.6-sol', choices:[{finish_reason:options.finishReason || 'stop', message:{content: options.invalidJson ? '{invalid' : JSON.stringify(options.content || content)}}] }), { status:options.status || 200 });
    }
  }); return { generate:module.exports, calls, state };
}
test('metadata uses Sol low once and labels the actual model on successful complete output', async() => {
  const p=load({model:'gpt-5.6-sol-2026-09-01'}); const r=await p.generate('comic piano, chiptune','새벽 세 시');
  assert.equal(r.source,'ai'); assert.equal(r.model,'gpt-5.6-sol-2026-09-01'); assert.equal(r.title,'새벽의 고양이');
  assert.equal(p.calls.length,1); assert.equal(p.calls[0].url,'https://api.openai.com/v1/chat/completions');
  assert.equal(p.calls[0].body.model,'gpt-5.6-sol'); assert.equal(p.calls[0].body.reasoning_effort,'low'); assert.equal(p.calls[0].body.max_completion_tokens,4096);
  for(const k of ['temperature','max_tokens','top_p']) assert.equal(p.calls[0].body[k],undefined);
  assert.equal(p.state.cleared,1);
});
for(const options of [{missingKey:true},{status:403},{status:429},{network:true},{invalidJson:true},{model:'gpt-4o'},{finishReason:'length'},{content:{title:'Only title'}}]) test(`optional metadata cannot fabricate AI success after ${Object.keys(options)[0]}`,async() => {
  const p=load(options); const r=await p.generate('comic piano, chiptune','새벽 세 시');
  assert.equal(r.source,'basic'); assert.equal(r.model,null); assert.equal(r.title,'comic piano'); assert.equal(r.description,'');
  assert.equal(p.calls.length,options.missingKey?0:1); assert.equal(p.state.cleared,options.missingKey?0:1);
});
