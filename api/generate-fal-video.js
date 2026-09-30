// Fal.ai — manda a la cola un video con Kling o Seedance.
// No espera a que termine: el cliente consulta el estado con fal-video-status.js.
const { fal } = require('@fal-ai/client');
const { selectVideoRoute } = require('../lib/fal-models');

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

  const {
    prompt,
    imageDataUrl,
    imageDataUrls,
    durationSeconds,
    generateAudio,
    resolution = '720p',
    modelId = 'kling-3-pro'
  } = req.body || {};
  if (!prompt) {
    res.status(400).json({ error: 'Falta el prompt.' });
    return;
  }
  const rawReferences = Array.isArray(imageDataUrls) && imageDataUrls.length
    ? imageDataUrls
    : (imageDataUrl ? [imageDataUrl] : []);
  if (!rawReferences.length) {
    res.status(400).json({ error: 'Falta la imagen de referencia.' });
    return;
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar FAL_KEY en Vercel.' });
    return;
  }
  fal.config({ credentials: apiKey });

  try {
    const route = selectVideoRoute(modelId, rawReferences.length);
    const uploadedUrls = [];
    for (const dataUrl of rawReferences) {
      uploadedUrls.push(await fal.storage.upload(dataUrlToBlob(dataUrl)));
    }

    const requestedDuration = Number(durationSeconds) || 5;
    const clampedDuration = Math.min(route.maxDuration, Math.max(route.minDuration, Math.round(requestedDuration)));
    const selectedResolution = route.resolutions.includes(resolution) ? resolution : '720p';
    const input = {
      prompt,
      generate_audio: !!generateAudio,
      duration: String(clampedDuration)
    };
    input[route.referenceField] = route.referenceField === 'image_urls' ? uploadedUrls : uploadedUrls[0];
    if (route.referenceField === 'image_urls') input.task = 'reference';
    if (route.resolutions.length) input.resolution = selectedResolution;

    const { request_id } = await fal.queue.submit(route.endpointId, { input });

    res.status(200).json({ requestId: request_id, endpointId: route.endpointId, routeKey: route.key, modelId });
  } catch (err) {
    const status = /no permitido|una sola imagen/i.test(err.message || '') ? 400 : 500;
    res.status(status).json({ error: err.message || 'Error inesperado al contactar Fal.ai.' });
  }
};
