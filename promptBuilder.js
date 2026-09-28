const PromptBuilder = (() => {
  const STYLE_PRESETS = {
    'photoreal-cinematic': {
      label: 'Fotorrealista cinematográfico',
      photoreal: true,
      text: 'photorealistic cinematic image, natural skin texture, realistic materials, professional color grading'
    },
    'fantasy': {
      label: 'Fantasía',
      text: 'epic fantasy digital painting, dramatic atmosphere, intricate detail, painterly rendering, concept-art quality'
    },
    'pixar': {
      label: 'Animación 3D (tipo Pixar)',
      text: 'stylized 3D animated feature film look, Pixar-style character rendering, soft global illumination, expressive stylized proportions'
    },
    'anime': {
      label: 'Anime',
      text: 'anime key visual, cel-shaded, clean line art, vibrant anime color palette, studio-quality anime illustration'
    }
  };

  // Se agrega solo en estilos fotorrealistas: evita que modelos como gpt-image-1
  // o flux-kontext tiendan al look de juguete / plastilina / render 3D.
  // Diccionario fijo para las opciones de los menús de "Detalles técnicos":
  // el usuario ve el español y el prompt usa siempre el mismo término en inglés.
  const TERM_EN = {
    'luz natural': 'natural light', 'hora dorada': 'golden hour', 'luz de estudio': 'studio lighting',
    'contraluz': 'backlight', 'luz dura': 'hard light', 'luz difusa': 'soft diffused light', 'neón': 'neon lighting',
    'luz de vela': 'candlelight', 'claroscuro': 'chiaroscuro', 'luz de mediodía': 'harsh midday sun',
    '35mm': '35mm lens', '50mm': '50mm lens', '85mm retrato': '85mm portrait lens', 'gran angular 24mm': '24mm wide-angle lens',
    'teleobjetivo': 'telephoto lens', 'ojo de pez': 'fisheye lens', 'macro': 'macro lens',
    'anamórfico cinematográfico': 'cinematic anamorphic lens', 'cámara en mano': 'handheld camera',
    'misterioso': 'mysterious', 'melancólico': 'melancholic', 'épico': 'epic', 'romántico': 'romantic', 'tenso': 'tense',
    'sereno': 'serene', 'nostálgico': 'nostalgic', 'onírico': 'dreamlike', 'oscuro': 'dark', 'alegre': 'joyful',
    'cálida': 'warm', 'fría': 'cool', 'monocromática': 'monochromatic', 'alto contraste': 'high contrast', 'pastel': 'pastel',
    'saturada': 'saturated', 'desaturada': 'desaturated', 'tonos tierra': 'earth tones', 'blanco y negro': 'black and white',
    'neón vibrante': 'vibrant neon',
    'ciudad nocturna': 'city at night', 'bosque': 'forest', 'interior minimalista': 'minimalist interior', 'playa': 'beach',
    'desierto': 'desert', 'estudio fotográfico': 'photo studio', 'calle urbana': 'urban street', 'montaña': 'mountain',
    'espacio futurista': 'futuristic space', 'café': 'café'
  };

  // Campos de texto que pueden venir en español y se traducen (diccionario o IA).
  const TRANSLATABLE_FIELDS = [
    ['description', 'physicalTraits'], ['description', 'outfit'], ['description', 'distinguishingFeatures'],
    ['description', 'freeformNotes'], ['technical', 'setting'], ['technical', 'lighting'], ['technical', 'cameraLens'],
    ['technical', 'mood'], ['technical', 'colorPalette']
  ];
  const DUO_FIELDS = ['scene', 'interaction', 'positionA', 'positionB', 'outfitA', 'outfitB', 'additionalInstructions'];

  const normalize = text => String(text || '').trim().toLowerCase();

  // Glosario del usuario: pares { es, en }. Sin "en" significa "no traducir".
  function cleanGlossary(glossary) {
    return (glossary || [])
      .map(g => ({ es: String(g?.es || '').trim(), en: String(g?.en || '').trim() }))
      .filter(g => g.es)
      .map(g => ({ es: g.es, en: g.en || g.es }));
  }

  // Huella del glosario: si cambia, las traducciones IA guardadas dejan de valer.
  const glossaryKey = glossary => JSON.stringify(cleanGlossary(glossary).map(g => [normalize(g.es), g.en]));

  function dictionaryTerm(text, glossary) {
    const norm = normalize(text);
    const own = cleanGlossary(glossary).find(g => normalize(g.es) === norm);
    return own ? own.en : TERM_EN[norm];
  }

  const isCacheValid = (cached, text, glossary) =>
    !!cached && cached.src === text && (cached.gl || glossaryKey([])) === glossaryKey(glossary);

  // Devuelve el texto en inglés: glosario/diccionario > traducción IA guardada (si sigue vigente) > original.
  function english(ficha, key, raw, glossary) {
    const text = String(raw || '').trim();
    if (!text) return '';
    const fromDict = dictionaryTerm(text, glossary);
    if (fromDict) return fromDict;
    const cached = ficha.translations?.[key];
    const result = isCacheValid(cached, text, glossary) ? cached.en : text;
    return result.replace(/[.\s]+$/, '');
  }

  // Campos con texto que todavía no tienen traducción vigente.
  function pendingTranslations(ficha, glossary) {
    const pending = {};
    const entries = TRANSLATABLE_FIELDS.map(([group, field]) => [`${group}.${field}`, ficha[group]?.[field]]);
    for (const tag of ficha.tags || []) entries.push([`tag:${tag}`, tag]);
    if (ficha.style === 'custom') entries.push(['customStyle', ficha.customStyle]);
    for (const [key, raw] of entries) {
      const text = String(raw || '').trim();
      if (!text || dictionaryTerm(text, glossary)) continue;
      if (isCacheValid(ficha.translations?.[key], text, glossary)) continue;
      pending[key] = text;
    }
    return pending;
  }

  function pendingDuoTranslations(primary, secondary, duo, glossary) {
    const pending = {};
    const identityFields = new Set(['description.physicalTraits', 'description.outfit', 'description.distinguishingFeatures']);
    const primaryFields = new Set([...identityFields, 'technical.lighting', 'technical.cameraLens', 'technical.mood', 'technical.colorPalette', 'customStyle']);
    for (const [key, value] of Object.entries(pendingTranslations(primary, glossary))) {
      if (primaryFields.has(key) || key.startsWith('tag:')) pending[`a:${key}`] = value;
    }
    for (const [key, value] of Object.entries(pendingTranslations(secondary || {}, glossary))) {
      if (identityFields.has(key)) pending[`b:${key}`] = value;
    }
    for (const field of DUO_FIELDS) {
      const text = String(duo?.[field] || '').trim();
      if (!text || dictionaryTerm(text, glossary)) continue;
      if (isCacheValid(duo?.translations?.[field], text, glossary)) continue;
      pending[`duo:${field}`] = text;
    }
    return pending;
  }

  // Estilo por defecto: fotorrealista, salvo que la ficha pida otro explícitamente.
  function resolveStyle(ficha, styleOverride, glossary) {
    const key = styleOverride || ficha.style || 'photoreal-cinematic';
    if (key === 'custom') {
      const custom = english(ficha, 'customStyle', ficha.customStyle, glossary);
      return custom
        ? { text: custom, photoreal: false }
        : { text: STYLE_PRESETS['photoreal-cinematic'].text, photoreal: true };
    }
    const preset = STYLE_PRESETS[key];
    if (preset) return { text: preset.text, photoreal: !!preset.photoreal };
    return { text: key, photoreal: false };
  }

  function build(ficha, { platform = 'nano-banana', styleOverride, glossary } = {}) {
    const style = resolveStyle(ficha, styleOverride, glossary);
    const en = (group, field) => english(ficha, `${group}.${field}`, ficha[group]?.[field], glossary);
    const sections = [];
    const section = (title, lines) => {
      const content = lines.filter(Boolean);
      if (content.length) sections.push(`${title}\n${content.join('\n')}`);
    };
    const line = (label, value) => value ? `${label}: ${value.replace(/[.\s]+$/, '')}.` : '';
    section('REFERENCE AND IDENTITY', [
      'Treat the first reference image as the authoritative identity reference. Preserve the exact facial geometry, eye shape and spacing, nose, mouth, jawline, apparent age, skin tone, hairstyle, body build and proportions. Keep unspecified features unchanged and apply only the explicit changes below.'
    ]);
    section('APPEARANCE AND REQUESTED CHANGES', [
      line('Physical traits', en('description', 'physicalTraits')),
      line('Clothing', en('description', 'outfit')),
      line('Distinctive features', en('description', 'distinguishingFeatures'))
    ]);
    section('SCENE AND ACTION', [line('Scene, action and interactions', en('technical', 'setting'))]);
    section('VISUAL STYLE', [line('Style', style.text), line('Mood', en('technical', 'mood')),
      line('Color palette', en('technical', 'colorPalette')),
      line('Style tags', (ficha.tags || []).map(t => english(ficha, `tag:${t}`, t, glossary)).join(', '))]);
    section('CAMERA AND LIGHTING', [line('Camera', en('technical', 'cameraLens')), line('Lighting', en('technical', 'lighting'))]);
    section('ADDITIONAL INSTRUCTIONS', [en('description', 'freeformNotes')]);
    if (style.photoreal) section('REALISM', ['Natural anatomy and physically plausible lighting. Avoid a synthetic or plastic appearance.']);
    return sections.join('\n\n');
  }

  function buildDuo(primary, secondary, duo = {}, { platform = 'nano-banana', glossary } = {}) {
    const style = resolveStyle(primary, undefined, glossary);
    const a = (group, field) => english(primary, `${group}.${field}`, primary?.[group]?.[field], glossary);
    const b = (group, field) => english(secondary || {}, `${group}.${field}`, secondary?.[group]?.[field], glossary);
    const d = field => english({ translations: duo.translations }, field, duo[field], glossary);
    const sections = [];
    const section = (title, lines) => {
      const content = lines.filter(Boolean);
      if (content.length) sections.push(`${title}\n${content.join('\n')}`);
    };
    const line = (label, value) => value ? `${label}: ${value.replace(/[.\s]+$/, '')}.` : '';
    const nameA = String(primary?.name || 'Character A').trim();
    const nameB = String(secondary?.name || 'Character B').trim();

    section(`CHARACTER A — ${nameA.toUpperCase()}`, [
      'Reference image 1 belongs only to Character A. Preserve this person’s exact facial geometry, eye shape and spacing, nose, mouth, jawline, apparent age, skin tone, hairstyle, body build and proportions.',
      line('Physical traits', a('description', 'physicalTraits')),
      line('Clothing', d('outfitA') || a('description', 'outfit')),
      line('Distinctive features', a('description', 'distinguishingFeatures')),
      line('Position in the image', d('positionA'))
    ]);
    section(`CHARACTER B — ${nameB.toUpperCase()}`, [
      'Reference image 2 belongs only to Character B. Preserve this person’s exact facial geometry, eye shape and spacing, nose, mouth, jawline, apparent age, skin tone, hairstyle, body build and proportions.',
      line('Physical traits', b('description', 'physicalTraits')),
      line('Clothing', d('outfitB') || b('description', 'outfit')),
      line('Distinctive features', b('description', 'distinguishingFeatures')),
      line('Position in the image', d('positionB'))
    ]);
    section('IDENTITY SEPARATION', [
      'Keep Character A and Character B as two distinct people. Do not blend, exchange or average their faces, bodies, hairstyles, clothing or distinctive features. Include both characters exactly once.'
    ]);
    section('SCENE AND INTERACTION', [line('Scene', d('scene')), line('Action and interaction', d('interaction'))]);
    section('VISUAL STYLE', [
      line('Style', style.text), line('Mood', a('technical', 'mood')),
      line('Color palette', a('technical', 'colorPalette')),
      line('Style tags', (primary?.tags || []).map(t => english(primary, `tag:${t}`, t, glossary)).join(', '))
    ]);
    section('CAMERA AND LIGHTING', [line('Camera', a('technical', 'cameraLens')), line('Lighting', a('technical', 'lighting'))]);
    section('ADDITIONAL INSTRUCTIONS', [d('additionalInstructions')]);
    if (style.photoreal) section('REALISM', ['Natural anatomy and physically plausible lighting. Avoid a synthetic or plastic appearance.']);
    return sections.join('\n\n');
  }

  return { STYLE_PRESETS, build, buildDuo, pendingTranslations, pendingDuoTranslations, cleanGlossary, glossaryKey };
})();

if (typeof module !== 'undefined') module.exports = PromptBuilder;
