const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
const source=app.slice(app.indexOf('async function startGeneration('),app.indexOf('async function urlToDataUrl('));
for(const provider of ['meigen-image','fal-video']) test(`${provider} keeps selected options across screen rebuild`,async()=>{
 const f={id:'f',promptHistory:[],generations:[],promptDraft:{signature:'valid'}};
 const fields={'#promptText':{value:'English prompt'},'#meigenModel':{value:'nanobanana-2'},'#videoDuration':{value:'12'},'#videoAudio':{checked:true}};
 let sent;
 const context={translating:false,activePromptDraft:f=>f.promptDraft,activePendingFor:()=>({}),generationMode:()=> 'single',secondFicha:()=>null,primaryReference:f=>f.referenceImages?.[0],generationSource:f=>f,MEIGEN_MODELS:[],promptSignature:()=> 'valid',$:id=>fields[id],uid:()=> 'g',now:()=> 'now',
 persist:async()=>{fields['#meigenModel'].value='seedream-5.0-pro';fields['#videoDuration'].value='5';fields['#videoAudio'].checked=false;},
 apiMeigenSubmit:async(f,p,m)=>{sent=m;return 'job';},apiFalVideoSubmit:async(f,p,d,a)=>{sent={d,a};return 'job';},
 finishGeneration:async()=>{},pollMeigen:()=>{},pollFalVideo:()=>{},updatePromptStatus:()=>{},toast:()=>{}};
 vm.createContext(context);vm.runInContext(source,context);await context.startGeneration(f,provider);
 if(provider==='meigen-image')assert.equal(sent,'nanobanana-2');else assert.deepEqual(sent,{d:12,a:true});
});
test('pending translation blocks generation before any API request',async()=>{
 let blocked=false;
 const context={translating:false,activePromptDraft:()=>({signature:'valid'}),activePendingFor:()=>({outfit:'azul'}),generationMode:()=> 'single',secondFicha:()=>null,primaryReference:()=>({}),updatePromptStatus:()=>{blocked=true;}};
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

