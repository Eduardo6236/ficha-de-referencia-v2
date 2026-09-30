// Fal.ai — genera una imagen desde texto o edita una imagen de referencia.
const EDIT_ENDPOINT_ID = process.env.FAL_IMAGE_MODEL || 'fal-ai/flux-pro/kontext';
const TEXT_ENDPOINT_ID = process.env.FAL_TEXT_IMAGE_MODEL || 'fal-ai/flux-pro/kontext/text-to-image';

function selectEndpoint(hasReference) {
  return hasReference ? EDIT_ENDPOINT_ID : TEXT_ENDPOINT_ID;
}

function falErrorDetails(err) {
  const status = Number(err?.status || err?.statusCode || err?.response?.status) || 500;
  const raw = err?.body?.detail || err?.body?.error || err?.message;
  const detail = Array.isArray(raw)
    ? raw.map(item => item?.msg || item?.message || String(item)).join('; ')
    : (typeof raw === 'string' ? raw : 'Error inesperado al contactar Fal.ai.');

  if (status === 401 || status === 403 || /unauthori[sz]ed|invalid.*key|forbidden/i.test(detail)) {
    return { status: 401, message: 'La clave FAL_KEY no es válida o ya no tiene acceso. Actualízala en Vercel.' };
  }
  if (status === 402 || /insufficient|credit|balance|payment/i.test(detail)) {
    return { status: 402, message: 'La cuenta de Fal.ai no tiene saldo o créditos suficientes.' };
  }
  if (status === 404 || /not found|endpoint/i.test(detail)) {
    return { status: 400, message: 'El modelo configurado en Fal.ai no existe o ya no está disponible.' };
  }
  if (status === 422 || /validation|required/i.test(detail)) {
    return { status: 422, message: `Fal.ai rechazó los datos enviados: ${detail.slice(0, 300)}` };
  }
  return { status: status >= 400 && status < 600 ? status : 500, message: `Error de Fal.ai: ${detail.slice(0, 300)}` };
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

  const { prompt, imageDataUrl } = req.body || {};
  if (!prompt) {
    res.status(400).json({ error: 'Falta el prompt.' });
    return;
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar FAL_KEY en Vercel.' });
    return;
  }
  const { fal } = require('@fal-ai/client');
  fal.config({ credentials: apiKey });

  try {
    const input = { prompt };
    if (imageDataUrl) {
      const blob = dataUrlToBlob(imageDataUrl);
      input.image_url = await fal.storage.upload(blob);
    }

    const result = await fal.subscribe(selectEndpoint(Boolean(imageDataUrl)), { input, logs: false });
    const imageUrl = result?.data?.images?.[0]?.url || result?.data?.image?.url;
    if (!imageUrl) {
      res.status(500).json({ error: 'Fal.ai no devolvió ninguna imagen.' });
      return;
    }
    res.status(200).json({ imageUrl });
  } catch (err) {
    const normalized = falErrorDetails(err);
    res.status(normalized.status).json({ error: normalized.message });
  }
};

module.exports.selectEndpoint = selectEndpoint;
module.exports.falErrorDetails = falErrorDetails;

