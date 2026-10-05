// Produce one complete catalog+registry bundle for an atomic site deployment.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');const DIR=path.join(ROOT,'artifacts/discovery-vocals-v2-20261005');
const {validateManifest,firstClip}=require('./discovery-vocal-rollout-240.cjs');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write=(file,data)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
function validatedRows(m,{allowPending=false,allowAvailableReferences=false}={}) {
 validateManifest(m);
 const ids=new Set(),samples=new Set(),personas=new Set();
 return m.jobs.map(j=>{
  const clip=firstClip(j),s=j.sample;
  const referenceReady=j.personaState==='ready'&&j.personaSourceVersion==='A'&&j.personaAudioId===clip.id&&j.personaTaskId===j.taskId
    &&j.personaModel==='style_persona'&&/^[A-Za-z0-9_-]{6,160}$/.test(j.personaId||'');
  const held=allowAvailableReferences&&['held','uncertain'].includes(j.personaState)&&!Object.hasOwn(j,'personaId');
  const pending=((allowPending||allowAvailableReferences)&&!j.personaState&&!j.personaId)||held;
  if(typeof j.taskId!=='string'||!/^[A-Za-z0-9_-]{6,160}$/.test(j.taskId)||(!referenceReady&&!pending)
    ||s?.version!=='A'||s.clipId!==clip.id||!Number.isFinite(s.seconds)||s.seconds<30||s.seconds>30.15
    ||!j.options.style.startsWith(j.profile.stylePrompt))throw new Error('FIRST_A_REFERENCE_NOT_READY');
  if(ids.has(j.id)||samples.has(s.sha256)||(referenceReady&&personas.has(j.personaId)))throw new Error('DUPLICATE_BINDING');
  ids.add(j.id);samples.add(s.sha256);if(referenceReady)personas.add(j.personaId);
  const sample=path.join(DIR,'samples',`${j.id}-A.mp3`),original=path.join(DIR,'original',`${j.id}-A.mp3`);
  if(hash(sample)!==s.sha256||hash(original)!==s.originalSha256)throw new Error('AUDIO_PROVENANCE');
  return {id:j.id,discoveryVoiceId:j.id,name:j.profile.provisionalName,shortDescription:j.profile.shortDescription,
   desc:`${j.profile.shortDescription} ${j.profile.signatureBehavior}`,gender:j.gender,language:j.language,
   category:j.profile.family,tags:j.profile.audibleAnchors,stylePrompt:j.profile.stylePrompt,
   audioUrl:`/assets/voices/discovery-v2-20261005/${j.id}-A.mp3`,previewStatus:'ready',previewStartSeconds:0,sampleDurationSeconds:30,
   bpm:88,lyricsPrompt:j.options.lyrics,createdAtISO:m.createdAt,reuseStatus:referenceReady?'ready':'pending',designStatus:'verified',qualityReview:'unreviewed',sampleVersion:'A'};
 });
}
function main() {
 const m=JSON.parse(fs.readFileSync(path.join(DIR,'rollout-240.json')));const args=process.argv||[];
 const rows=validatedRows(m,{allowPending:args.includes('--previews'),allowAvailableReferences:args.includes('--available-references')});
 const original=JSON.parse(fs.readFileSync(path.join(ROOT,'src/data/discoveryVoices.json')));
 const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'src/lib/voice/discovery-voice-personas.json')));
 const baseline=original.filter(v=>!/^discovery-v2-/.test(v.id));
 for(const j of m.jobs)if(j.personaState==='ready')registry[j.id]=j.personaId;
 else if(Object.hasOwn(registry,j.id))throw new Error('PENDING_REFERENCE_EXISTS');
 const out=path.join(DIR,'publication');fs.mkdirSync(out,{recursive:true});
 const catalog=[...baseline,...rows];
 const readyNewReferences=rows.filter(r=>r.reuseStatus==='ready').length;
 // Held includes uncertain outcomes; unsubmitted rows are counted only as pending.
 const heldNewReferences=m.jobs.filter(j=>['held','uncertain'].includes(j.personaState)).length;
 write(path.join(out,'discoveryVoices.json'),catalog);write(path.join(out,'discovery-voice-personas.json'),registry);
 write(path.join(out,'receipt.json'),{createdAt:new Date().toISOString(),newIdentities:rows.length,female:120,male:120,
   selectedVersion:'A',catalogTotal:catalog.length,readyNewReferences,heldNewReferences,designValidation:'passed',qualityReview:'unreviewed',
   sameSingerGuarantee:false,actualKnownGenerationCredits:m.jobs.reduce((n,j)=>n+(Number.isFinite(j.creditsConsumed)?j.creditsConsumed:0),0),
   unknownCostRequests:m.jobs.filter(j=>!Number.isFinite(j.creditsConsumed)).length,
   catalogSha256:hash(path.join(out,'discoveryVoices.json')),registrySha256:hash(path.join(out,'discovery-voice-personas.json'))});
 console.log(JSON.stringify({newIdentities:240,catalogTotal:catalog.length,references:readyNewReferences,heldReferences:heldNewReferences,selectedVersion:'A',qualityReview:'unreviewed'}));
}
module.exports={validatedRows};if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
