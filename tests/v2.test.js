const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../promptBuilder');
test('legacy setting appears once in scene; explicit camera has no default lens conflict', () => {
 const f = {style:'photoreal-cinematic', technical:{setting:'Playa',cameraLens:'85mm retrato'},description:{},tags:[]};
 const text = P.build(f);
 assert.equal(text.match(/beach/g).length,1);
 assert.match(text,/SCENE AND ACTION/);
 assert.match(text,/85mm/);
 assert.doesNotMatch(text,/35mm|Visual Identity Profile|Wearing/);
});
test('anime does not receive photographic constraints', () => {
 assert.doesNotMatch(P.build({style:'anime'}),/REALISM|plastic|natural skin|photorealistic/);
});
test('Spanish custom tags participate in translation', () => {
 const f={tags:['luz de ventana']};
 assert.deepEqual(P.pendingTranslations(f),{'tag:luz de ventana':'luz de ventana'});
 f.translations={'tag:luz de ventana':{src:'luz de ventana',en:'window light'}};
 assert.match(P.build(f),/Style tags: window light/);
});
test('translation service partial failures remain explicitly untranslated', async () => {
 const handler = require('../api/translate-prompt');
 const previousFetch=global.fetch, previousKey=process.env.GEMINI_API_KEY;
 process.env.GEMINI_API_KEY='test-placeholder';
 global.fetch=async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({outfit:'blue jacket'})}]}}]})});
 let result;
 try {
  await handler({method:'POST',body:{fields:{outfit:'chaqueta azul',scene:'en el bosque'}}},{status(){return this;},json(data){result=data;}});
  assert.deepEqual(result.untranslated,['scene']);
  assert.equal(result.translations.outfit,'blue jacket');
 } finally {global.fetch=previousFetch;if(previousKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousKey;}
});

test('two-character prompt assigns one identity to each numbered reference', () => {
 const a={name:'Eduardo',style:'photoreal-cinematic',description:{physicalTraits:'hombre de barba',outfit:'camiseta verde',distinguishingFeatures:'reloj negro'},technical:{lighting:'Luz natural',cameraLens:'50mm',mood:'Sereno',colorPalette:'Cálida'},tags:[],translations:{
  'description.physicalTraits':{src:'hombre de barba',en:'bearded man'},
  'description.outfit':{src:'camiseta verde',en:'green T-shirt'},
  'description.distinguishingFeatures':{src:'reloj negro',en:'black watch'}
 }};
 const b={name:'Ana',description:{physicalTraits:'mujer de cabello largo',outfit:'vestido azul',distinguishingFeatures:'lentes redondos'},translations:{
  'description.physicalTraits':{src:'mujer de cabello largo',en:'woman with long hair'},
  'description.outfit':{src:'vestido azul',en:'blue dress'},
  'description.distinguishingFeatures':{src:'lentes redondos',en:'round glasses'}
 }};
 const duo={scene:'frente a la estatua',interaction:'tomándose una foto',positionA:'a la izquierda',positionB:'a la derecha',translations:{
  scene:{src:'frente a la estatua',en:'in front of the Statue of Liberty'},
  interaction:{src:'tomándose una foto',en:'taking a photograph together'},
  positionA:{src:'a la izquierda',en:'on the left'},positionB:{src:'a la derecha',en:'on the right'}
 }};
 const text=P.buildDuo(a,b,duo);
 assert.match(text,/CHARACTER A — EDUARDO[\s\S]*Reference image 1 belongs only to Character A/);
 assert.match(text,/CHARACTER B — ANA[\s\S]*Reference image 2 belongs only to Character B/);
 assert.match(text,/Do not blend, exchange or average their faces/);
 assert.match(text,/in front of the Statue of Liberty/);
 assert.equal((text.match(/CHARACTER A —/g)||[]).length,1);
 assert.equal((text.match(/CHARACTER B —/g)||[]).length,1);
});

test('two-character scene fields require their own current English translations', () => {
 const a={description:{},technical:{},tags:[]}, b={description:{},technical:{},tags:[]};
 const duo={scene:'en una cafetería',interaction:'conversando'};
 assert.deepEqual(P.pendingDuoTranslations(a,b,duo),{'duo:scene':'en una cafetería','duo:interaction':'conversando'});
 duo.translations={scene:{src:'en una cafetería',en:'in a café'},interaction:{src:'conversando',en:'talking together'}};
 assert.deepEqual(P.pendingDuoTranslations(a,b,duo),{});
});

