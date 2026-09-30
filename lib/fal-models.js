const IMAGE_MODELS = {
  'flux-kontext': {
    label: 'Flux Kontext',
    maxReferences: 1,
    editEndpoint: () => process.env.FAL_IMAGE_MODEL || 'fal-ai/flux-pro/kontext',
    textEndpoint: () => process.env.FAL_TEXT_IMAGE_MODEL || 'fal-ai/flux-pro/kontext/text-to-image',
    referenceField: 'image_url'
  },
  'seedream-5-lite': {
    label: 'Seedream 5.0 Lite',
    maxReferences: 10,
    editEndpoint: () => 'bytedance/seedream/v5/lite/edit',
    textEndpoint: () => 'bytedance/seedream/v5/lite/text-to-image',
    referenceField: 'image_urls',
    imageSize: 'auto_2K'
  },
  'seedream-5-pro': {
    label: 'Seedream 5.0 Pro',
    maxReferences: 10,
    editEndpoint: () => 'bytedance/seedream/v5/pro/edit',
    textEndpoint: () => 'bytedance/seedream/v5/pro/text-to-image',
    referenceField: 'image_urls',
    imageSize: 'auto_2K'
  }
};

const VIDEO_ROUTES = {
  'kling-3-pro-single': {
    modelId: 'kling-3-pro',
    endpointId: process.env.FAL_VIDEO_MODEL || 'fal-ai/kling-video/v3/pro/image-to-video',
    referenceField: 'start_image_url',
    minDuration: 3,
    maxDuration: 15,
    resolutions: []
  },
  'seedance-2-single': {
    modelId: 'seedance-2',
    endpointId: 'bytedance/seedance-2.0/us/image-to-video',
    referenceField: 'image_url',
    minDuration: 4,
    maxDuration: 15,
    resolutions: ['480p', '720p', '1080p', '4k']
  },
  'seedance-2-reference': {
    modelId: 'seedance-2',
    endpointId: 'bytedance/seedance-2.0/us/reference-to-video',
    referenceField: 'image_urls',
    minDuration: 4,
    maxDuration: 15,
    resolutions: ['480p', '720p', '1080p', '4k']
  },
  'seedance-2-5-single': {
    modelId: 'seedance-2-5',
    endpointId: 'bytedance/seedance-2.5/us/image-to-video',
    referenceField: 'image_url',
    minDuration: 4,
    maxDuration: 30,
    resolutions: ['480p', '720p', '1080p']
  },
  'seedance-2-5-reference': {
    modelId: 'seedance-2-5',
    endpointId: 'bytedance/seedance-2.5/us/reference-to-video',
    referenceField: 'image_urls',
    minDuration: 4,
    maxDuration: 30,
    resolutions: ['480p', '720p', '1080p']
  }
};

function selectImageModel(modelId = 'flux-kontext') {
  const model = IMAGE_MODELS[modelId];
  if (!model) throw new Error('Modelo de imagen de Fal.ai no permitido.');
  return model;
}

function selectImageEndpoint(modelId, hasReference) {
  const model = selectImageModel(modelId);
  return hasReference ? model.editEndpoint() : model.textEndpoint();
}

function selectVideoRoute(modelId = 'kling-3-pro', referenceCount = 1) {
  const mode = referenceCount > 1 ? 'reference' : 'single';
  const key = `${modelId}-${mode}`;
  const route = VIDEO_ROUTES[key];
  if (!route) {
    if (referenceCount > 1 && modelId === 'kling-3-pro') {
      throw new Error('Kling 3.0 Pro usa una sola imagen inicial. Elige Seedance para dos personajes.');
    }
    throw new Error('Modelo de video de Fal.ai no permitido.');
  }
  return { ...route, key };
}

function getVideoRoute(routeKey = 'kling-3-pro-single') {
  const route = VIDEO_ROUTES[routeKey];
  if (!route) throw new Error('Ruta de video de Fal.ai no permitida.');
  return { ...route, key: routeKey };
}

module.exports = {
  IMAGE_MODELS,
  VIDEO_ROUTES,
  selectImageModel,
  selectImageEndpoint,
  selectVideoRoute,
  getVideoRoute
};
