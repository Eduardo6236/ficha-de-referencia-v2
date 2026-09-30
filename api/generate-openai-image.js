// OpenAI — genera una imagen, o la edita guiada por una o más imágenes de
// referencia. Sunburst prioriza calidad en trabajos sensibles a identidad.
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst';
const QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'high';

function supportsInputFidelity(model) {
  return model === 'gpt-image-1' || model === 'gpt-image-1.5';
}

function openAiErrorMessage(status, body) {
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message || parsed?.error?.code || body;
  } catch { /* OpenAI can occasionally return a plain-text gateway error. */ }
  if (status === 401 || status === 403) return 'La clave OPENAI_API_KEY no es válida o ya no tiene acceso. Actualízala en Vercel.';
  if (status === 429 && /quota|billing|credit/i.test(detail)) return 'La cuenta de OpenAI no tiene saldo o cuota disponible.';
  if (status === 429) return 'OpenAI está limitando temporalmente las solicitudes. Intenta de nuevo en unos minutos.';
  if (status === 404 || /model.*not found|does not exist/i.test(detail)) return `El modelo configurado en OpenAI no está disponible: ${MODEL}.`;
  return `Error de la API de OpenAI: ${String(detail).slice(0, 300)}`;
}

function dataUrlToBlob(dataUrl) {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) throw new Error('Imagen de referencia inválida.');
  const [, mimeType, base64] = match;
  const buffer = Buffer.from(base64, 'base64');
  return new Blob([buffer], { type: mimeType });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { prompt, referenceImages } = req.body || {};
  if (!prompt) {
    res.status(400).json({ error: 'Falta el prompt.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar OPENAI_API_KEY en Vercel.' });
    return;
  }

  try {
    let response;
    if (referenceImages?.length) {
      const form = new FormData();
      form.append('model', MODEL);
      form.append('prompt', prompt);
      form.append('quality', QUALITY);
      // GPT Image 2 y 2.5 procesan las referencias con alta fidelidad de forma
      // nativa; los modelos 1 y 1.5 todavía requieren este parámetro.
      if (supportsInputFidelity(MODEL)) form.append('input_fidelity', 'high');
      referenceImages.forEach((dataUrl, i) => {
        const blob = dataUrlToBlob(dataUrl);
        const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
        form.append('image[]', blob, `reference-${i}.${ext}`);
      });
      response = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}` },
        body: form
      });
    } else {
      response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, prompt, quality: QUALITY })
      });
    }

    if (!response.ok) {
      const errBody = await response.text();
      res.status(response.status).json({ error: openAiErrorMessage(response.status, errBody) });
      return;
    }

    const data = await response.json();
    const imageBase64 = data?.data?.[0]?.b64_json;
    if (!imageBase64) {
      res.status(500).json({ error: 'La API no devolvió ninguna imagen.' });
      return;
    }

    res.status(200).json({ imageBase64, mimeType: 'image/png' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error inesperado al contactar OpenAI.' });
  }
};

module.exports.supportsInputFidelity = supportsInputFidelity;
module.exports.openAiErrorMessage = openAiErrorMessage;

