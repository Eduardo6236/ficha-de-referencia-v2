// MeiGen — manda a la cola una imagen a partir de un prompt + imágenes de referencia.
// No espera a que termine: el cliente consulta el estado con meigen-status.js.
const { randomUUID } = require('crypto');

const API_BASE = 'https://www.meigen.ai/api';
const DEFAULT_MODEL = process.env.MEIGEN_IMAGE_MODEL || 'seedream-5.0-pro';

// Solo aceptamos modelos que conocemos para no reenviar cualquier string a la API.
const ALLOWED_MODELS = new Set([
  'seedream-5.0-pro', 'gpt-image-2.5', 'gemini-3-pro-image-preview', 'nanobanana-2', 'midjourney-v8.1', 'grok-image'
]);

function meigenErrorMessage(status, data) {
  const detail = data?.error || data?.message || data?.code || '';
  if (status === 401 || status === 403) return 'La clave MEIGEN_API_TOKEN no es válida o ya no tiene acceso. Actualízala en Vercel.';
  if (status === 402 || /insufficient|credit|balance|payment/i.test(detail)) return 'La cuenta de MeiGen no tiene créditos suficientes.';
  if (status === 429) return 'MeiGen está limitando temporalmente las solicitudes. Intenta de nuevo en unos minutos.';
  if (status === 404 || /model.*not found|invalid model/i.test(detail)) return 'El modelo elegido ya no está disponible en MeiGen.';
  const code = data?.code ? ` (${data.code})` : '';
  return `Error de MeiGen${code}: ${detail || 'no devolvió generationId'}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { prompt, referenceImages, modelId } = req.body || {};
  if (!prompt) {
    res.status(400).json({ error: 'Falta el prompt.' });
    return;
  }
  if (modelId && !ALLOWED_MODELS.has(modelId)) {
    res.status(400).json({ error: `Modelo de MeiGen no soportado: ${modelId}` });
    return;
  }
  const refs = Array.isArray(referenceImages) ? referenceImages : [];
  if (refs.some(r => typeof r !== 'string' || !r.startsWith('data:image/'))) {
    res.status(400).json({ error: 'Imagen de referencia inválida.' });
    return;
  }

  const apiKey = process.env.MEIGEN_API_TOKEN;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar MEIGEN_API_TOKEN en Vercel.' });
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/generate/v2`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt,
        modelId: modelId || DEFAULT_MODEL,
        ...(refs.length ? { referenceImages: refs } : {}),
        idempotencyKey: randomUUID()
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.generationId) {
      const status = response.ok ? 500 : response.status;
      res.status(status).json({ error: meigenErrorMessage(status, data) });
      return;
    }

    res.status(200).json({ generationId: data.generationId, modelId: data.modelId, creditsUsed: data.creditsUsed });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error inesperado al contactar MeiGen.' });
  }
};

module.exports.meigenErrorMessage = meigenErrorMessage;

