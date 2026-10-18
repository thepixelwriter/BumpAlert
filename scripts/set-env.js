const fs = require('fs');
const path = require('path');

// Prefer local .env values for developer builds; CI supplies the same values as variables.
const envFilePath = path.join(__dirname, '../.env');
const localEnv = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : '';
const readLocalValue = (name) => {
  const match = localEnv.match(new RegExp(`^${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\r\\n#]*))\\s*(?:#.*)?$`, 'm'));
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
};

const apiKey =
  readLocalValue('GOOGLE_MAPS_API_KEY') ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_KEY ||
  '';

const runtimeEnvPath = path.join(__dirname, '../src/environments/environment.runtime.ts');
const googleClientId = readLocalValue('GOOGLE_CLIENT_ID') || process.env.GOOGLE_CLIENT_ID || '';
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
