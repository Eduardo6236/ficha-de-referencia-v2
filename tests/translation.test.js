const test = require('node:test');
const assert = require('node:assert');
const PromptBuilder = require('../promptBuilder.js');
const { maskTokens, unmaskTokens, validateFields } = require('../api/translate-prompt.js');

const baseFicha = overrides => ({
  name: 'Ana', style: 'photoreal-cinematic', tags: [],
  description: { physicalTraits: '', outfit: '', distinguishingFeatures: '', freeformNotes: '' },
  technical: { lighting: '', cameraLens: '', mood: '', colorPalette: '', setting: '' },
  ...overrides
});

test('menu options use the fixed dictionary and need no AI translation', () => {
  const f = baseFicha({ technical: { lighting: 'Contraluz', cameraLens: '85mm retrato', mood: 'Onírico', colorPalette: 'Tonos tierra', setting: 'Playa' } });
  const prompt = PromptBuilder.build(f);
  assert.match(prompt, /Lighting: backlight\./);
  assert.match(prompt, /Camera: 85mm portrait lens\./);
  assert.match(prompt, /Mood: dreamlike\./);
  assert.deepStrictEqual(PromptBuilder.pendingTranslations(f), {});
});

test('free text is pending until a translation for the same text is cached', () => {
  const f = baseFicha({ description: { outfit: 'chaqueta de cuero negra', physicalTraits: '', distinguishingFeatures: '', freeformNotes: '' } });
  assert.deepStrictEqual(PromptBuilder.pendingTranslations(f), { 'description.outfit': 'chaqueta de cuero negra' });

  const translated = { ...f, translations: { 'description.outfit': { src: 'chaqueta de cuero negra', en: 'black leather jacket.' } } };
  assert.deepStrictEqual(PromptBuilder.pendingTranslations(translated), {});
  assert.match(PromptBuilder.build(translated), /Clothing: black leather jacket\./);
});

test('an edited field invalidates its cached translation', () => {
  const f = baseFicha({
    description: { outfit: 'vestido rojo', physicalTraits: '', distinguishingFeatures: '', freeformNotes: '' },
    translations: { 'description.outfit': { src: 'chaqueta de cuero negra', en: 'black leather jacket' } }
  });
  assert.deepStrictEqual(PromptBuilder.pendingTranslations(f), { 'description.outfit': 'vestido rojo' });
  assert.match(PromptBuilder.build(f), /Clothing: vestido rojo\./);
});

test('@Image tokens are masked and restored exactly', () => {
  const { masked, tokens } = maskTokens('la chaqueta de @Image2 con el fondo de @Image1');
  assert.strictEqual(masked, 'la chaqueta de ⟦0⟧ con el fondo de ⟦1⟧');
  assert.strictEqual(unmaskTokens('the jacket from ⟦0⟧ with the background of ⟦1⟧', tokens),
    'the jacket from @Image2 with the background of @Image1');
});

test('a translation that drops a placeholder is rejected', () => {
  const { tokens } = maskTokens('igual que @Image1');
  assert.strictEqual(unmaskTokens('same as the image', tokens), null);
});

test('field validation rejects bad input', () => {
  assert.ok(validateFields(null));
  assert.ok(validateFields({}));
  assert.ok(validateFields({ a: 3 }));
  assert.ok(validateFields({ a: 'x'.repeat(4001) }));
  assert.strictEqual(validateFields({ a: 'hola' }), null);
});

test('user glossary overrides the built-in dictionary and skips AI translation', () => {
  const glossary = [{ es: 'Contraluz', en: 'rim-lit silhouette' }, { es: 'plano secuencia', en: 'one-take tracking shot' }];
  const f = baseFicha({
    description: { outfit: '', physicalTraits: '', distinguishingFeatures: '', freeformNotes: 'Plano secuencia' },
    technical: { lighting: 'contraluz', cameraLens: '', mood: '', colorPalette: '', setting: '' }
  });
  const prompt = PromptBuilder.build(f, { glossary });
  assert.match(prompt, /Lighting: rim-lit silhouette\./);
  assert.match(prompt, /one-take tracking shot/);
  assert.deepStrictEqual(PromptBuilder.pendingTranslations(f, glossary), {});
});

test('a glossary term with empty English stays untranslated', () => {
  assert.deepStrictEqual(PromptBuilder.cleanGlossary([{ es: ' gaffer ', en: '' }, { es: '', en: 'x' }]), [{ es: 'gaffer', en: 'gaffer' }]);
});

test('changing the glossary invalidates cached AI translations', () => {
  const oldGlossary = [{ es: 'bounce', en: '' }];
  const f = baseFicha({
    description: { outfit: 'chaqueta con bounce', physicalTraits: '', distinguishingFeatures: '', freeformNotes: '' },
    translations: { 'description.outfit': { src: 'chaqueta con bounce', en: 'jacket with bounce', gl: PromptBuilder.glossaryKey(oldGlossary) } }
  });
  assert.deepStrictEqual(PromptBuilder.pendingTranslations(f, oldGlossary), {});
  assert.deepStrictEqual(PromptBuilder.pendingTranslations(f, [...oldGlossary, { es: 'chaqueta', en: 'bomber jacket' }]),
    { 'description.outfit': 'chaqueta con bounce' });
});

test('server glossary validation and instruction', () => {
  const { validateGlossary, buildInstruction } = require('../api/translate-prompt.js');
  assert.strictEqual(validateGlossary(undefined), null);
  assert.ok(validateGlossary('x'));
  assert.ok(validateGlossary([{ es: 'a'.repeat(101) }]));
  assert.strictEqual(validateGlossary([{ es: 'gaffer', en: '' }]), null);
  const text = buildInstruction([{ es: 'plano\nsecuencia', en: 'oner' }, { es: 'gaffer', en: '' }]);
  assert.match(text, /plano secuencia = oner; gaffer = gaffer/);
});

