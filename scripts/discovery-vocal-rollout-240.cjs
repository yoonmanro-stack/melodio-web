// Explicitly authorized rollout: one A reference per design, never B fallback.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const provider = require('../worker/suno-provider');
const { validateProfiles, mediaUrl, ensureAuditionOutputs } = require('./discovery-vocal-audition-v2.cjs');
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'artifacts/discovery-vocals-v2-20261005');
const FILE = path.join(DIR, 'rollout-240.json');
const CAP = 240;
const LANGUAGES = { en: 'English', ko: 'Korean', ja: 'Japanese', fr: 'French' };
const CONDITIONS = 'solo singing audition, 88 BPM, voice starts immediately, extremely quiet piano and bass only, dry intimate foreground lead, short melody centered on the specified vocal register, ordinary intensity, steady pitched core, no high-note climax, no instrumental intro, complete sung phrase ending.';
function save(m) { fs.writeFileSync(FILE + '.tmp', JSON.stringify(m, null, 2) + '\n'); fs.renameSync(FILE + '.tmp', FILE); }
function report(m) {
  const accepted = m.jobs.filter(j => j.taskId);
  const known = accepted.filter(j => Number.isFinite(j.creditsConsumed));
  console.log(JSON.stringify({ total: m.jobs.length, states: m.jobs.reduce((a,j)=>(a[j.state]=(a[j.state]||0)+1,a),{}),
    accepted: accepted.length, knownCredits: known.reduce((a,j)=>a+j.creditsConsumed,0), unknownCostRequests: accepted.length-known.length,
    firstASamples: m.jobs.filter(j=>j.sample?.version==='A').length, referencesReady: m.jobs.filter(j=>j.personaState==='ready').length,
    registrationHeld: m.jobs.filter(j=>['uncertain','held','submitting'].includes(j.personaState)).length }));
}
function validateManifest(m) {
  if (m.requestCap !== CAP || m.jobs.length !== CAP || m.selectedVersion !== 'A' || m.authorization !== 'user-20261005-first-output-all240') throw new Error('ROLLOUT_SCOPE');
  validateProfiles(m.jobs.map(j=>j.profile));
  const genders = {}, langs = {};
  for (const j of m.jobs) {
    const o=j.options;
    if (j.id !== j.profile.id || j.gender !== j.profile.gender || !LANGUAGES[j.language] || o.model !== 'V6' || o.durationSeconds !== 45
      || o.instrumental !== false || o.personaId || o.personaModel || o.style.length >=1000 || o.vocalGender !== (j.gender==='female'?'f':'m')) throw new Error('ROLLOUT_REQUEST');
    genders[j.gender]=(genders[j.gender]||0)+1; const key=j.gender+':'+j.language; langs[key]=(langs[key]||0)+1;
  }
  if (genders.female!==120 || genders.male!==120 || Object.values(langs).some(n=>n!==30) || Object.keys(langs).length!==8) throw new Error('ROLLOUT_BALANCE');
}
function canSubmit(j) { return !j.taskId && ['planned','throttled'].includes(j.state); }
function firstClip(j) {
  if (j.state!=='complete' || !Array.isArray(j.clips) || !j.clips[0]?.id || !j.clips[0]?.url || j.clips[0].id===`${j.taskId}-1`) throw new Error('FIRST_A_NOT_READY');
  return j.clips[0];
}
function canRegister(j) { return j.state==='complete' && j.sample?.version==='A' && j.sample.clipId===j.clips?.[0]?.id && !j.personaState; }
function normalizePersonaDescription(s) { return s.replace(/\bthe voice\b/gi,'the vocal timbre'); }
async function json(response) {
  const parts=[]; let total=0;
  for await(const part of response.body) { total+=part.length;if(total>512*1024)throw new Error('PROVIDER_SIZE');parts.push(part); }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
async function registerPersonas(m,config,{limit=CAP,concurrency=8,timeoutMs=90000,continueOnHeld=false,fetchImpl=fetch,persist=save,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw new Error('PERSONA_CONCURRENCY');
  if(!Number.isInteger(timeoutMs)||timeoutMs<30000||timeoutMs>120000)throw new Error('PERSONA_TIMEOUT');
  if(typeof continueOnHeld!=='boolean')throw new Error('PERSONA_CONTINUATION');
  const pending=m.jobs.filter(canRegister).slice(0,limit);
  for(let offset=0;offset<pending.length;offset+=concurrency) {
    const started=Date.now();
    const results=await Promise.allSettled(pending.slice(offset,offset+concurrency).filter(canRegister).map(async j=>{
      const clip=firstClip(j),attemptStarted=Date.now();
      const description=normalizePersonaDescription(j.profile.stylePrompt);
      const body=JSON.stringify({model:'ai-music-api/generate-persona',input:{task_id:j.taskId,audio_id:clip.id,name:j.profile.provisionalName,
        description,vocal_start:0,vocal_end:30,style:description.slice(0,200)}});
      j.personaState='submitting';j.personaSubmittedAt=new Date(attemptStarted).toISOString();j.personaAttemptId=crypto.randomUUID();
      j.personaTaskId=j.taskId;j.personaAudioId=clip.id;j.personaSourceVersion='A';j.personaTimeoutMs=timeoutMs;
      j.personaRequestSha256=crypto.createHash('sha256').update(body).digest('hex');
      j.personaHttpStatus=null;j.personaProviderCode=null;j.personaErrorCategory=null;j.personaFinishedAt=null;j.personaElapsedMs=null;
      persist(m);
      const signal=AbortSignal.timeout(timeoutMs);let errorCategory='transport';
      try {
        const res=await fetchImpl('https://api.kie.ai/api/v1/jobs/createTask',{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},
          body,signal});
        if(Number.isInteger(res.status)&&res.status>=100&&res.status<=599)j.personaHttpStatus=res.status;
        errorCategory='response_body';const raw=await json(res),code=Number(raw?.code);
        if(Number.isSafeInteger(code))j.personaProviderCode=code;
        if(!res.ok){errorCategory='http_error';throw new Error('PERSONA_RESULT');}
        if(j.personaProviderCode!==200){errorCategory=j.personaProviderCode===null?'invalid_response':'provider_error';throw new Error('PERSONA_RESULT');}
        const id=raw?.data?.persona_id||raw?.data?.personaId;
        if(typeof id!=='string'){errorCategory=id==null?'missing_persona_id':'invalid_persona_id';throw new Error('PERSONA_RESULT');}
        if(!/^[A-Za-z0-9_-]{6,160}$/.test(id)){errorCategory='invalid_persona_id';throw new Error('PERSONA_RESULT');}
        j.personaId=id;j.personaModel='style_persona';j.personaState='ready';
      } catch(e) {
        j.personaState='uncertain';j.personaFinishedAt=new Date().toISOString();j.personaElapsedMs=Math.max(0,Date.now()-attemptStarted);
        j.personaErrorCategory=e?.name==='TimeoutError'||(signal.aborted&&signal.reason?.name==='TimeoutError')?'timeout'
          :e?.name==='AbortError'?'aborted':e?.message==='PROVIDER_SIZE'?'oversized_response':e?.name==='SyntaxError'?'invalid_json':errorCategory;
        persist(m);throw Object.assign(new Error('ROLLOUT_PERSONA_HELD'),{registrationReceiptPersisted:true});
      }
      j.personaFinishedAt=new Date().toISOString();j.personaElapsedMs=Math.max(0,Date.now()-attemptStarted);
      persist(m);
    }));
    report(m);
    const failures=results.filter(r=>r.status==='rejected');
    if(failures.length&&(!continueOnHeld||failures.some(r=>r.reason?.registrationReceiptPersisted!==true)))throw new Error('ROLLOUT_PERSONA_HELD');
    // Eight requests per batch with at least eleven seconds between starts
    // stays below the documented account limit of twenty per ten seconds.
    if(offset+concurrency<pending.length)await pause(Math.max(0,11000-(Date.now()-started)));
  }
}
async function main() {
  require('@next/env').loadEnvConfig(ROOT,true,{info(){},error(){}});
  fs.mkdirSync(DIR,{recursive:true}); const lock=path.join(DIR,'rollout.lock'); fs.mkdirSync(lock);
  try {
    const mode=process.argv[2]||'report';
    if(mode==='plan') {
      if(fs.existsSync(FILE))throw new Error('ROLLOUT_EXISTS');
      const profiles=['female','male'].flatMap(g=>JSON.parse(fs.readFileSync(path.join(ROOT,`docs/research/voice-discovery-v2/${g}-profiles.json`))));validateProfiles(profiles);
      const initial=JSON.parse(fs.readFileSync(path.join(DIR,'manifest.json')));
      const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'src/data/discoveryVoices.json')));
      const slots=Object.fromEntries(['female','male'].flatMap(g=>Object.keys(LANGUAGES).map(l=>[g+':'+l,30])));
      for(const j of initial.jobs)slots[j.gender+':ko']--;
      const jobs=profiles.map(p=>{
        const existing=initial.jobs.find(j=>j.id===p.id);
        if(existing) {
          if(existing.profile.stylePrompt!==p.stylePrompt)throw new Error('IMPORTED_PROMPT_CHANGED');
          return {...existing,profile:p,language:'ko',sample:(existing.samples||[]).find(s=>s.version==='A')};
        }
        const language=Object.keys(LANGUAGES).filter(l=>slots[p.gender+':'+l]>0).sort((a,b)=>slots[p.gender+':'+b]-slots[p.gender+':'+a])[0];slots[p.gender+':'+language]--;
        const lyrics=catalog.find(v=>v.language===language&&v.gender===p.gender).lyricsPrompt;
        return { id:p.id,profile:p,gender:p.gender,language,state:'planned',options:{title:`${p.provisionalName} audition`,model:'V6',instrumental:false,
          vocalGender:p.gender==='female'?'f':'m',durationSeconds:45,style:`${p.stylePrompt} ${LANGUAGES[language]} ${CONDITIONS}`,lyrics,exclude:initial.jobs[0].options.exclude} };
      });
      const m={version:1,createdAt:new Date().toISOString(),requestCap:CAP,selectedVersion:'A',authorization:'user-20261005-first-output-all240',
        estimatedTotalCredits:2880,estimatedUnitCredits:12,priceNotGuaranteed:true,qualityReview:'unreviewed',sameSingerGuarantee:false,
        importedRequests:12,jobs};validateManifest(m);save(m);
    }
    const m=JSON.parse(fs.readFileSync(FILE));validateManifest(m);
    const limit=Number(process.argv[3]||CAP); if(!Number.isInteger(limit)||limit<1||limit>CAP)throw new Error('ROLLOUT_LIMIT');
    if(mode==='submit') {
      const config=provider.getKieConfig();let count=0;
      for(const j of m.jobs.filter(canSubmit).slice(0,limit)) {
        j.state='submitting';j.submittedAt=new Date().toISOString();save(m);
        try { const r=await provider.submitKieSunoJob(j.options,config); j.taskId=r.taskId;j.state='processing'; }
        catch(e) { j.state=e instanceof provider.SunoProviderError&&e.code===429?'throttled':'submission-uncertain';j.errorCategory=e instanceof provider.SunoProviderError?`provider-${e.code}`:'transport';save(m);throw new Error('ROLLOUT_SUBMISSION_HELD'); }
        save(m);count++;if(count%10===0)report(m);
        await new Promise(resolve=>setTimeout(resolve,550));
      }
    } else if(mode==='status') {
      const config=provider.getKieConfig();const jobs=m.jobs.filter(j=>j.taskId&&j.state==='processing');
      for(let i=0;i<jobs.length;i+=6) {
        const results=await Promise.allSettled(jobs.slice(i,i+6).map(async j=>{
          const res=await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(j.taskId)}`,{headers:{Authorization:`Bearer ${config.apiKey}`},signal:AbortSignal.timeout(20000)});
          const raw=await json(res);if(!res.ok||Number(raw.code)!==200)throw new Error('STATUS_HTTP');
          return {j,result:provider.normalizeKieSunoStatus(raw,j.taskId),credits:Number.isFinite(raw.data?.creditsConsumed)?raw.data.creditsConsumed:null};
        }));
        for(const r of results)if(r.status==='fulfilled'){const {j,result,credits}=r.value;j.state=result.state;j.checkedAt=new Date().toISOString();j.creditsConsumed=credits;
          if(result.state==='complete')j.clips=result.clips.slice(0,2).map(c=>({id:c.id,url:c.audio_url,duration:c.duration}));}
        save(m);
      }
    } else if(mode==='collect') {
      fs.mkdirSync(path.join(DIR,'original'),{recursive:true});fs.mkdirSync(path.join(DIR,'samples'),{recursive:true});let count=0;
      for(const j of m.jobs.filter(j=>j.state==='complete'&&!j.sample&&!j.sampleError&&(j.sampleAttempts||0)<3).slice(0,limit)) {
        j.sampleAttempts=(j.sampleAttempts||0)+1;save(m);
        const clip=firstClip(j);const name=`${j.id}-A`;const original=path.join(DIR,'original',`${name}.mp3`);
        try {
          if(!fs.existsSync(original)) {
            const res=await fetch(mediaUrl(clip.url),{signal:AbortSignal.timeout(60000)});mediaUrl(res.url);
            if(!res.ok||Number(res.headers.get('content-length'))>30_000_000)throw new Error('DOWNLOAD_HTTP_OR_SIZE');
            const parts=[];let size=0;for await(const part of res.body){size+=part.length;if(size>30_000_000)throw new Error('DOWNLOAD_SIZE');parts.push(part);}
            if(size<10000)throw new Error('DOWNLOAD_SIZE');
            const staged=original+`.stage-${crypto.randomUUID()}.mp3`;fs.writeFileSync(staged,Buffer.concat(parts),{flag:'wx'});
            fs.linkSync(staged,original);fs.unlinkSync(staged);
          }
          const sample=path.join(DIR,'samples',`${name}.mp3`);const hook=path.join(DIR,'samples',`${name}-hook.mp3`);
          const output=ensureAuditionOutputs(clip,{original,sample,hook});
          j.sample={version:'A',clipId:clip.id,...output,originalSha256:crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex'),
            sampleUrl:`/samples/${name}.mp3`,hookUrl:`/samples/${name}-hook.mp3`,qualityReview:'unreviewed'};
          delete j.sampleLastError;
        } catch(e) {
          if(['ORIGINAL_TOO_SHORT','SAMPLE_DURATION'].includes(e.message))j.sampleError=e.message==='ORIGINAL_TOO_SHORT'?'first-A-shorter-than30':'invalid-existing-A-output';
          else j.sampleLastError='asset-read-or-convert';
        }
        save(m);if(++count%10===0)report(m);
      }
    } else if(mode==='persona'||mode==='persona-remaining') {
      await registerPersonas(m,provider.getKieConfig(),{limit,continueOnHeld:mode==='persona-remaining'});
    } else if(!['plan','report'].includes(mode))throw new Error('ROLLOUT_MODE');
    report(m);
  } finally {fs.rmdirSync(lock);}
}
module.exports={canSubmit,canRegister,firstClip,validateManifest,normalizePersonaDescription,registerPersonas,CAP};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
