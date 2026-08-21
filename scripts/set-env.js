const fs = require('fs');
const path = require('path');

const apiKey =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_KEY ||
  '';

const envProdPath = path.join(__dirname, '../src/environments/environment.prod.ts');
const envDevPath = path.join(__dirname, '../src/environments/environment.ts');

if (apiKey) {
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
  console.log('Successfully injected Google Maps API key into environment files from environment variable.');
} else {
  console.log('No GOOGLE_MAPS_API_KEY environment variable detected; keeping existing environment files.');
}
