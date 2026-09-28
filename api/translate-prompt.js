// Traduce al inglés los campos de texto libre de la ficha para armar el prompt.
// Protege @Image1, @Image2, etc. con marcadores para que el modelo no los toque.
const MODEL = process.env.TRANSLATE_MODEL || 'gemini-flash-latest';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_FIELDS = 20;
const MAX_FIELD_CHARS = 4000;
const MAX_GLOSSARY_ENTRIES = 200;
const MAX_TERM_CHARS = 100;
const TOKEN_PATTERN = /@[A-Za-z]+\d*/g;

// Términos de set y cine: cómo deben quedar en inglés (o sin traducir).
const GLOSSARY = [
  'primer plano = close-up', 'primerísimo primer plano = extreme close-up', 'plano detalle = detail shot',
  'plano medio = medium shot', 'plano americano = cowboy shot', 'plano general = wide shot',
  'plano entero = full shot', 'contrapicado = low angle', 'picado = high angle', 'cenital = overhead shot',
  'contraluz = backlight', 'hora dorada = golden hour', 'hora azul = blue hour', 'luz de relleno = fill light',
  'luz principal = key light', 'luz de recorte = rim light', 'travelling = tracking shot',
  'keep unchanged: gaffer, flag, bounce, softbox, dolly, gimbal, Steadicam, key light, fill light, rim light'
].join('; ');

const INSTRUCTION =
  'You translate Spanish descriptions into natural English for AI image and video generation prompts. ' +
  'Translate each value of the JSON object and return a JSON object with exactly the same keys. ' +
  'Rules: keep every placeholder like ⟦0⟧ exactly as written; keep numbers, measurements, brand names and proper names unchanged; ' +
  'if a value is already in English, return it as is; do not add details, explanations or quotes. ' +
  `Film-set glossary (Spanish = English): ${GLOSSARY}. ` +
  'In film context "plano" means "shot", never "flat".';

function validateFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return 'Falta el objeto "fields".';
  const entries = Object.entries(fields);
  if (!entries.length) return 'No hay campos para traducir.';
  if (entries.length > MAX_FIELDS) return `Máximo ${MAX_FIELDS} campos por traducción.`;
  for (const [key, value] of entries) {
    if (typeof value !== 'string') return `El campo "${key}" debe ser texto.`;
    if (value.length > MAX_FIELD_CHARS) return `El campo "${key}" supera ${MAX_FIELD_CHARS} caracteres.`;
  }
  return null;
}

// Glosario del usuario: [{ es, en }]. Sin "en" = conservar el término tal cual.
function validateGlossary(glossary) {
  if (glossary === undefined) return null;
  if (!Array.isArray(glossary)) return 'El glosario debe ser una lista.';
  if (glossary.length > MAX_GLOSSARY_ENTRIES) return `Máximo ${MAX_GLOSSARY_ENTRIES} términos en el glosario.`;
  for (const entry of glossary) {
    if (!entry || typeof entry.es !== 'string' || (entry.en !== undefined && typeof entry.en !== 'string')) return 'Término de glosario inválido.';
    if (entry.es.length > MAX_TERM_CHARS || (entry.en || '').length > MAX_TERM_CHARS) return `Cada término del glosario admite hasta ${MAX_TERM_CHARS} caracteres.`;
  }
  return null;
}

const oneLine = text => String(text || '').replace(/[\r\n;=]+/g, ' ').trim();

function buildInstruction(glossary) {
  const own = (glossary || [])
    .map(g => ({ es: oneLine(g.es), en: oneLine(g.en) }))
    .filter(g => g.es)
    .map(g => `${g.es} = ${g.en || g.es}`);
  if (!own.length) return INSTRUCTION;
  return `${INSTRUCTION} User glossary (Spanish = English, takes priority over everything else; ` +
    `when both sides are equal, keep the term untranslated): ${own.join('; ')}.`;
}

function maskTokens(text) {
  const tokens = [];
  const masked = text.replace(TOKEN_PATTERN, match => `⟦${tokens.push(match) - 1}⟧`);
  return { masked, tokens };
}

// Devuelve null si el modelo perdió o cambió algún marcador.
function unmaskTokens(text, tokens) {
  let restored = text;
  for (let i = 0; i < tokens.length; i++) {
    const marker = `⟦${i}⟧`;
    if (!restored.includes(marker)) return null;
    restored = restored.split(marker).join(tokens[i]);
  }
  return restored;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { fields, glossary } = req.body || {};
  const invalid = validateFields(fields) || validateGlossary(glossary);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en el servidor de esta versión.' });
    return;
  }

  const masks = {};
  const payload = {};
  for (const [key, value] of Object.entries(fields)) {
    masks[key] = maskTokens(value);
    payload[key] = masks[key].masked;
  }

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildInstruction(glossary) }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      })
    });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Error de red al contactar Gemini.' });
    return;
  }

  if (!response.ok) {
    const errBody = await response.text();
    res.status(response.status).json({ error: `Error de la API de Gemini: ${errBody.slice(0, 500)}` });
    return;
  }

  const data = await response.json();
  const raw = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    res.status(502).json({ error: 'La traducción no volvió en un formato válido. Intenta de nuevo.' });
    return;
  }

  // Si una traducción falta o rompió un marcador, se conserva el texto original de ese campo.
  const translations = {};
  const untranslated = [];
  for (const [key, value] of Object.entries(fields)) {
    const candidate = typeof parsed?.[key] === 'string' ? unmaskTokens(parsed[key].trim(), masks[key].tokens) : null;
    if (candidate) translations[key] = candidate;
    else { translations[key] = value; untranslated.push(key); }
  }

  res.status(200).json({ translations, untranslated });
};

module.exports.maskTokens = maskTokens;
module.exports.unmaskTokens = unmaskTokens;
module.exports.validateFields = validateFields;
module.exports.validateGlossary = validateGlossary;
module.exports.buildInstruction = buildInstruction;

