// src/utils/openai.js
const OpenAI = require('openai');

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY not set. OpenAI calls will fail.');
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// provide small compatibility wrapper so existing code can call either shape
module.exports = {
  // raw client if needed
  client,
  // preferred helper (older code may call createChatCompletion)
  createChatCompletion: async (opts) => {
    // new SDK: client.chat.completions.create
    if (client.chat && client.chat.completions && typeof client.chat.completions.create === 'function') {
      return client.chat.completions.create(opts);
    }
    // fallback: older method name
    if (typeof client.createChatCompletion === 'function') {
      return client.createChatCompletion(opts);
    }
    throw new Error('OpenAI client does not expose a chat completion method');
  },
  // expose chat if code expects openai.chat
  chat: client.chat || null
};

