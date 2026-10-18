const fs = require('fs');
const path = require('path');

// 1. Read from .env file if it exists locally
let envKey = '';
const envFilePath = path.join(__dirname, '../.env');
if (fs.existsSync(envFilePath)) {
  const content = fs.readFileSync(envFilePath, 'utf8');
  const match = content.match(/^GOOGLE_MAPS_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/m);
  if (match && match[1]) {
    envKey = match[1].trim();
  }
}

// 2. Fall back to process.env variables (e.g. in CI/CD, GitHub Actions, Cloudflare)
const apiKey =
  envKey ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_KEY ||
  '';

const runtimeEnvPath = path.join(__dirname, '../src/environments/environment.runtime.ts');
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const apiUrl = process.env.BACKEND_API_URL || 'https://api.bumpalert.thepixelwriter.com/api';

const runtimeContent = `// Generated locally from environment variables. Do not commit this file.
export const environment = ${JSON.stringify({
  production: false,
  googleMapsApiKey: apiKey === 'YOUR_GOOGLE_MAPS_API_KEY' ? '' : apiKey,
  googleClientId,
  apiUrl,
}, null, 2)};
`;

fs.writeFileSync(runtimeEnvPath, runtimeContent, 'utf8');
if (apiKey && apiKey !== 'YOUR_GOOGLE_MAPS_API_KEY') {
  console.log('Generated local Maps configuration from .env.');
} else {
  console.log('Generated runtime configuration without a Maps key; Maps features require GOOGLE_MAPS_API_KEY.');
}
