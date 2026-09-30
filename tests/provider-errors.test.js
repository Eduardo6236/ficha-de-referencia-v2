const assert = require('node:assert/strict');
const test = require('node:test');

test('Fal.ai selecciona el endpoint correcto según exista referencia', () => {
  const handler = require('../api/generate-fal-image');
  assert.equal(handler.selectEndpoint(true), 'fal-ai/flux-pro/kontext');
  assert.equal(handler.selectEndpoint(false), 'fal-ai/flux-pro/kontext/text-to-image');
});

test('Fal.ai convierte errores de autenticación en un mensaje útil', () => {
  const handler = require('../api/generate-fal-image');
  assert.deepEqual(
    handler.falErrorDetails({ status: 403, message: 'Forbidden' }),
    { status: 401, message: 'La clave FAL_KEY no es válida o ya no tiene acceso. Actualízala en Vercel.' }
  );
});

test('OpenAI distingue autenticación, saldo y modelo', () => {
  const handler = require('../api/generate-openai-image');
  assert.match(handler.openAiErrorMessage(401, '{}'), /OPENAI_API_KEY/);
  assert.match(handler.openAiErrorMessage(429, '{"error":{"message":"insufficient_quota"}}'), /saldo|cuota/);
  assert.match(handler.openAiErrorMessage(404, '{"error":{"message":"model not found"}}'), /modelo/);
});

test('MeiGen distingue autenticación y créditos', () => {
  const handler = require('../api/generate-meigen-image');
  assert.match(handler.meigenErrorMessage(401, { error: 'Unauthorized' }), /MEIGEN_API_TOKEN/);
  assert.match(handler.meigenErrorMessage(402, { error: 'insufficient credits' }), /créditos/);
});

