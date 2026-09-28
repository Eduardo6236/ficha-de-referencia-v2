const test = require('node:test');
const assert = require('node:assert/strict');

test('OpenAI edit defaults to Sunburst high quality without legacy fidelity parameter', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_IMAGE_MODEL;
  const previousQuality = process.env.OPENAI_IMAGE_QUALITY;
  process.env.OPENAI_API_KEY = 'test-placeholder';
  delete process.env.OPENAI_IMAGE_MODEL;
  delete process.env.OPENAI_IMAGE_QUALITY;
  const modulePath = require.resolve('../api/generate-openai-image');
  delete require.cache[modulePath];
  const handler = require(modulePath);
  const previousFetch = global.fetch;
  let sent;
  global.fetch = async (url, options) => {
    sent = { url, entries: Object.fromEntries(options.body.entries()) };
    return { ok: true, json: async () => ({ data: [{ b64_json: 'aW1hZ2U=' }] }) };
  };
  let statusCode, body;
  try {
    await handler({ method: 'POST', body: { prompt: 'Keep the same identity.', referenceImages: ['data:image/png;base64,aW1hZ2U='] } }, {
      status(code) { statusCode = code; return this; },
      json(value) { body = value; }
    });
    assert.equal(sent.url, 'https://api.openai.com/v1/images/edits');
    assert.equal(sent.entries.model, 'gpt-image-2.5-sunburst');
    assert.equal(sent.entries.quality, 'high');
    assert.equal(sent.entries.input_fidelity, undefined);
    assert.equal(statusCode, 200);
    assert.equal(body.imageBase64, 'aW1hZ2U=');
    assert.equal(handler.supportsInputFidelity('gpt-image-1'), true);
    assert.equal(handler.supportsInputFidelity('gpt-image-1.5'), true);
    assert.equal(handler.supportsInputFidelity('gpt-image-2'), false);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_IMAGE_MODEL; else process.env.OPENAI_IMAGE_MODEL = previousModel;
    if (previousQuality === undefined) delete process.env.OPENAI_IMAGE_QUALITY; else process.env.OPENAI_IMAGE_QUALITY = previousQuality;
  }
});

