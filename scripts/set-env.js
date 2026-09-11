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

if (apiKey && apiKey !== 'YOUR_GOOGLE_MAPS_API_KEY') {
  const runtimeContent = `// Generated locally from .env. Do not commit this file.
export const environment = {
  production: false,
  googleMapsApiKey: '${apiKey}',
  googleClientId: '${googleClientId}',
  apiUrl: '${apiUrl}',
};
`;

  fs.writeFileSync(runtimeEnvPath, runtimeContent, 'utf8');
  console.log('Generated local Maps configuration from .env.');
} else {
  console.log('No valid GOOGLE_MAPS_API_KEY found in .env or process.env.');
}
