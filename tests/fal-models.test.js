const assert = require('node:assert/strict');
const test = require('node:test');
const {
  selectImageModel,
  selectImageEndpoint,
  selectVideoRoute,
  getVideoRoute
} = require('../lib/fal-models');

test('Seedream 5 Pro accepts multiple reference images', () => {
  const model = selectImageModel('seedream-5-pro');
  assert.equal(model.maxReferences, 10);
  assert.equal(model.referenceField, 'image_urls');
  assert.equal(selectImageEndpoint('seedream-5-pro', true), 'bytedance/seedream/v5/pro/edit');
});

test('Seedance selects image-to-video for one reference', () => {
  const route = selectVideoRoute('seedance-2-5', 1);
  assert.equal(route.endpointId, 'bytedance/seedance-2.5/us/image-to-video');
  assert.equal(route.referenceField, 'image_url');
  assert.equal(route.maxDuration, 30);
});

test('Seedance selects reference-to-video for two characters', () => {
  const route = selectVideoRoute('seedance-2', 2);
  assert.equal(route.endpointId, 'bytedance/seedance-2.0/us/reference-to-video');
  assert.equal(route.referenceField, 'image_urls');
  assert.equal(getVideoRoute(route.key).endpointId, route.endpointId);
});

test('Kling rejects two independent character references', () => {
  assert.throws(() => selectVideoRoute('kling-3-pro', 2), /Seedance/);
});

test('unknown Fal models are rejected by the whitelist', () => {
  assert.throws(() => selectImageModel('custom/model'), /no permitido/);
  assert.throws(() => getVideoRoute('custom/model'), /no permitida/);
});
