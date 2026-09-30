const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const source=app.slice(app.indexOf('async function startGeneration('),app.indexOf('async function urlToDataUrl('));
for(const provider of ['meigen-image','fal-video']) test(`${provider} keeps selected options across screen rebuild`,async()=>{
 const f={id:'f',promptHistory:[],generations:[],promptDraft:{signature:'valid'}};
 const fields={'#promptText':{value:'English prompt'},'#meigenModel':{value:'nanobanana-2'},'#falImageModel':{value:'flux-kontext'},'#falVideoModel':{value:'seedance-2-5'},'#videoDuration':{value:'12'},'#videoResolution':{value:'1080p'},'#videoAudio':{checked:true}};
 let sent;
 const context={translating:false,activePromptDraft:f=>f.promptDraft,activePendingFor:()=>({}),generationMode:()=> 'single',generationOptions:()=>({falImageModel:'flux-kontext',falVideoModel:'kling-3-pro'}),secondFicha:()=>null,primaryReference:f=>f.referenceImages?.[0],generationSource:f=>f,MEIGEN_MODELS:[],promptSignature:()=> 'valid',$:id=>fields[id],uid:()=> 'g',now:()=> 'now',
 persist:async()=>{fields['#meigenModel'].value='seedream-5.0-pro';fields['#videoDuration'].value='5';fields['#videoAudio'].checked=false;},
 apiMeigenSubmit:async(f,p,m)=>{sent=m;return 'job';},apiFalVideoSubmit:async(f,p,options)=>{sent=options;return {requestId:'job',routeKey:'seedance-2-5-single'};},
 finishGeneration:async()=>{},pollMeigen:()=>{},pollFalVideo:()=>{},updatePromptStatus:()=>{},toast:()=>{}};
 vm.createContext(context);vm.runInContext(source,context);await context.startGeneration(f,provider);
 if(provider==='meigen-image')assert.equal(sent,'nanobanana-2');else {
  assert.equal(sent.modelId,'seedance-2-5');assert.equal(sent.durationSeconds,12);assert.equal(sent.generateAudio,true);assert.equal(sent.resolution,'1080p');
 }
});
test('pending translation blocks generation before any API request',async()=>{
 let blocked=false;
 const context={translating:false,activePromptDraft:()=>({signature:'valid'}),activePendingFor:()=>({outfit:'azul'}),generationMode:()=> 'single',generationOptions:()=>({falImageModel:'flux-kontext',falVideoModel:'kling-3-pro'}),secondFicha:()=>null,primaryReference:()=>({}),$:()=>null,updatePromptStatus:()=>{blocked=true;}};
 vm.createContext(context);vm.runInContext(source,context);await context.startGeneration({},'meigen-image');assert.equal(blocked,true);
});

test('OpenAI sends the principal identity reference first', async () => {
 const apiSource=app.slice(app.indexOf('async function apiOpenAiImage('),app.indexOf('// maxRefs:'));
 let request;
 const context={ensureSendableDataUrl:async value=>value,callApi:async(path,options)=>{
  request={path,body:JSON.parse(options.body)};return {mimeType:'image/png',imageBase64:'x'};
 }};
 vm.createContext(context);vm.runInContext(apiSource,context);
 const f={referenceImages:[{dataUrl:'second',isPrimary:false},{dataUrl:'principal',isPrimary:true},{dataUrl:'third'}]};
 await context.apiOpenAiImage(f,'prompt');
 assert.equal(request.path,'/api/generate-openai-image');
 assert.deepEqual(request.body.referenceImages,['principal','second','third']);
});

test('Fal video result preserves provider validation details', () => {
 const resultApi=fs.readFileSync(require.resolve('../api/fal-video-result.js'),'utf8');
 const helper=resultApi.slice(resultApi.indexOf('function falResultError('),resultApi.indexOf('module.exports = async'));
 const context={};
 vm.createContext(context);vm.runInContext(helper,context);
 const normalized = context.falResultError({
  status: 422,
  body: { detail: [{ msg: 'The completed request did not produce a video.' }] }
 });
 assert.equal(normalized.status, 422);
 assert.equal(normalized.message, 'The completed request did not produce a video.');
});

test('Fal video result explains real-person rejection in Spanish', () => {
 const resultApi=fs.readFileSync(require.resolve('../api/fal-video-result.js'),'utf8');
 const helper=resultApi.slice(resultApi.indexOf('function falResultError('),resultApi.indexOf('module.exports = async'));
 const context={};
 vm.createContext(context);vm.runInContext(helper,context);
 const normalized=context.falResultError({
  status:422,
  body:{detail:'The images or videos provided may contain likenesses of real people or other private information that cannot be processed.'}
 });
 assert.equal(normalized.status,422);
 assert.match(normalized.message,/persona real/);
 assert.match(normalized.message,/No se generó ningún video/);
});

