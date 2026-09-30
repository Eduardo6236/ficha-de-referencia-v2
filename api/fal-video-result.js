const { fal } = require('@fal-ai/client');
const { getVideoRoute } = require('../lib/fal-models');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { requestId, routeKey } = req.query || {};
  if (!requestId) {
    res.status(400).json({ error: 'Falta el requestId.' });
    return;
  }

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar FAL_KEY en Vercel.' });
    return;
  }
  fal.config({ credentials: apiKey });

  try {
    const route = getVideoRoute(routeKey);
    const result = await fal.queue.result(route.endpointId, { requestId });
    const videoUrl = result?.data?.video?.url;
    if (!videoUrl) {
      res.status(500).json({ error: 'El resultado de Fal.ai no incluyó un video.' });
      return;
    }
    res.status(200).json({ videoUrl });
  } catch (err) {
    const code = /no permitida/i.test(err.message || '') ? 400 : 500;
    res.status(code).json({ error: err.message || 'Error inesperado al obtener el resultado del video.' });
  }
};
