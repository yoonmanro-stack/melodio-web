/* Provider-routing regression: source inspection only; never sends a network request. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const IMAGE_URL = 'https://api.openai.com/v1/images/generations'

const contracts = [
  {
    file: 'src/lib/engines/lyrics-generator.ts',
    endpoint: CHAT_URL,
    directCall: /model:\s*LYRICS_MODEL/u,
    models: ['gpt-5.6-sol'],
  },
  {
    file: 'src/app/api/prompt-optimize/route.ts',
    endpoint: CHAT_URL,
    directCall: /attemptCall\(OPENAI_API_KEY, OPENAI_API_URL, OFFICIAL_MODEL_CHAIN\)/u,
    models: ['gpt-5.6-sol'],
  },
  {
    file: 'src/app/api/viral-cf/grok-video/prompt/route.ts',
    endpoint: CHAT_URL,
    directCall: /Authorization:\s*`Bearer \$\{OPENAI_API_KEY\}`/u,
    models: ['gpt-5.6-sol'],
  },
  {
    file: 'src/app/api/autopilot/analyze-image/route.ts',
    endpoint: CHAT_URL,
    directCall: /attemptVision\(apiKey, 'https:\/\/api\.openai\.com\/v1\/chat\/completions'\)/u,
    models: ['gpt-5.6-sol'],
  },
  {
    file: 'src/app/api/autopilot/branding/route.ts',
    endpoint: CHAT_URL,
    directCall: /attemptBranding\(apiKey, 'https:\/\/api\.openai\.com\/v1\/chat\/completions', OFFICIAL_MODEL_CHAIN\)/u,
    models: ['gpt-5.6-sol'],
  },
  {
    file: 'src/app/api/style-library/analyze-image/route.ts',
    endpoint: CHAT_URL,
    directCall: /attemptVision\(apiKey, 'https:\/\/api\.openai\.com\/v1\/chat\/completions'\)/u,
    models: ['gpt-5.6-sol'],
  },
  { file: 'src/app/api/youtube/route.ts', endpoint: CHAT_URL, directCall: /fetch\(OPENAI_API_URL/u, models: ['gpt-5.6-sol'] },
  { file: 'src/app/api/viral-cf/producer-brief/route.ts', endpoint: CHAT_URL, directCall: /fetch\(OPENAI_API_URL/u, models: ['gpt-5.6-sol'] },
]

let checks = 0

for (const contract of contracts) {
  const source = fs.readFileSync(path.join(root, contract.file), 'utf8')
  assert.doesNotMatch(source, /SUNO_API_(?:KEY|URL)|api\.302\.ai|302\.ai/iu, `${contract.file} still references the prohibited proxy`)
  assert.match(source, new RegExp(contract.endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'), `${contract.file} must retain the official OpenAI endpoint`)
  assert.match(source, contract.directCall, `${contract.file} must bind its provider call to the OpenAI key and endpoint`)
  assert.doesNotMatch(source, /['"]gpt-(?:5\.5|5\.6-(?:terra|luna)|4o(?:-mini)?)['"]/u, `${contract.file} retains a lower-model fallback`)
  for (const model of contract.models) {
    assert.match(source, new RegExp(`['"]${model.replaceAll('.', '\\.')}['"]`, 'u'), `${contract.file} must use fixed Sol text routing`)
  }
  checks += 1
}

{
  const file = 'src/app/api/autopilot/generate-image/route.ts'
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  assert.doesNotMatch(source, /SUNO_API_(?:KEY|URL)|api\.302\.ai|302\.ai|sunoApi(?:Key|Url)/iu, `${file} still references the prohibited proxy`)
  assert.match(source, /const openaiApiKey = process\.env\.OPENAI_API_KEY/u)
  assert.match(source, /const endpointUrl = 'https:\/\/api\.openai\.com\/v1\/images\/generations'/u)
  assert.match(source, /'Authorization': `Bearer \$\{openaiApiKey\}`/u)
  assert.match(source, /model: 'gpt-image-2'/u)
  checks += 1
}

{
  const file = 'src/lib/channel-system/publish-package-service.ts'
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  assert.doesNotMatch(source, /SUNO_API_(?:KEY|URL)|api\.302\.ai|302\.ai/iu, `${file} still references the prohibited proxy`)
  assert.match(source, /const apiKey = process\.env\.OPENAI_API_KEY/u)
  assert.match(source, /fetch\('https:\/\/api\.openai\.com\/v1\/images\/generations'/u)
  assert.match(source, /Authorization: `Bearer \$\{apiKey\}`/u)
  assert.match(source, /model: 'gpt-image-2'/u)
  checks += 1
}

console.log(JSON.stringify({ checks, passed: checks }))
