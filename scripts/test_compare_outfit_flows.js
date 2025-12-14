const { spawnSync } = require('child_process');
const path = require('path');

const node = process.execPath;
const script = path.join(__dirname, 'test_compare_outfit_flows_child.js');

const userId = process.env.TEST_USER_ID;
if (!userId) {
  console.error('ERROR: set TEST_USER_ID environment variable to a valid user UUID from your DB');
  process.exit(1);
}

const modes = [
  { name: 'AI_ON', env: {} },
  { name: 'AI_TIMEOUT', env: { OPENAI_TIMEOUT_MS: '1', OPENAI_MAX_RETRIES: '0' } },
  { name: 'AI_OFF', env: { OPENAI_API_KEY: '' } } // assumes utils/openai checks API key presence
];

for (const m of modes) {
  console.log('----------------------------------------');
  console.log('MODE:', m.name);
  const env = Object.assign({}, process.env, m.env, { DEBUG_AI_SERVICE: '1', TEST_USER_ID: userId });
  const out = spawnSync(node, [script], { env, stdio: 'inherit' });
  if (out.error) {
    console.error('child process error', out.error);
  }
  console.log('----------------------------------------\n\n');
}