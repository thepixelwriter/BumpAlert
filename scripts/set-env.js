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

const envProdPath = path.join(__dirname, '../src/environments/environment.prod.ts');
const envDevPath = path.join(__dirname, '../src/environments/environment.ts');

if (apiKey && apiKey !== 'YOUR_GOOGLE_MAPS_API_KEY') {
  const prodContent = `export const environment = {
  production: true,
  googleMapsApiKey: '${apiKey}',
};
`;

  const devContent = `export const environment = {
  production: false,
  googleMapsApiKey: '${apiKey}',
};
`;

  fs.writeFileSync(envProdPath, prodContent, 'utf8');
  fs.writeFileSync(envDevPath, devContent, 'utf8');
  console.log('Successfully injected Google Maps API key into environment files.');
} else {
  console.log('No valid GOOGLE_MAPS_API_KEY found in .env or process.env; keeping default configuration.');
}
