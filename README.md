# BumpAlert

BumpAlert is a mobile-first road hazard detection application that uses device motion sensors and GPS telemetry to identify bumps, potholes, and other road anomalies. It records the event location and impact data, presents the results on a map and telemetry dashboard, and creates shareable grievance cards for civic reporting.

## Features

- Detects road impacts from accelerometer and motion sensor data.
- Supports separate Bike and Car detection profiles.
- Uses GPS speed, location accuracy, and elevation changes to improve detection confidence.
- Continues detection through the native Android background detection service.
- Displays live acceleration, gyroscope, compass, GPS, speed, and elevation telemetry.
- Stores detected events locally for review and syncs user-scoped reports to the API.
- Adds secure login, registration, forgot password, and Google sign-in.
- Keeps anomaly records attached to the logged-in user and stores the payload in PostgreSQL.
- Shows detected hazards and nearby reports on Google Maps.
- Creates shareable anomaly cards with Google Street View imagery when available.
- Falls back to Google satellite imagery when Street View coverage is unavailable.
- Provides a Google Maps location link with each shared anomaly.
- Supports light and dark display modes.
- Includes a service worker and Cloudflare Pages deployment configuration.

## Distribution direction

The current hosted PWA is transitional. The planned release model is native Android and iOS apps that call the API directly. In the future, `bumpalert.thepixelwriter.com` will become a landing page linking to Google Play and the Apple App Store rather than hosting the app. Until that transition is complete, keep the existing web app and its API CORS origin available.

## Tech Stack

Client

- TypeScript
- Angular 20
- Ionic Angular 8
- Capacitor 8
- RxJS
- Google Maps JavaScript API
- Google Maps Static API
- Street View Static API
- Angular Service Worker

Native platforms

- Android
- iOS
- Capacitor Motion
- Capacitor Geolocation
- Capacitor Share
- Capacitor Status Bar

Deployment and tooling

- Cloudflare Pages and Wrangler
- Angular CLI
- ESLint

## Project Structure

```text
bumpAlert/
  src/                  Ionic Angular client source
  android/              Capacitor Android project
  ios/                  Capacitor iOS project
  public/               Static public assets
  scripts/              Build and environment scripts
  wrangler.jsonc        Cloudflare deployment configuration
```

## Getting Started

### Prerequisites

Install the following before starting development:

- Node.js 20 or newer
- npm
- Git
- Xcode and CocoaPods for iOS development
- Android Studio and a configured JDK for Android development

A Google Cloud project with billing enabled is required for Google Maps features.

### Clone the repository

```bash
git clone https://github.com/thepixelwriter/BumpAlert.git
cd BumpAlert
```

### Configure client environment

Create a `.env` file in the client repository root:

```dotenv
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

The build script reads these values and generates the local runtime environment file. `GOOGLE_CLIENT_ID` is used by Google sign-in; configure the same OAuth client ID as the `GOOGLE_CLIENT_ID` secret for the API Worker so it can verify sign-in tokens. For GitHub Actions deployment, add `GOOGLE_MAPS_API_KEY` and `GOOGLE_CLIENT_ID` as repository Actions secrets. Do not commit `.env` or generated runtime credentials.

Enable the following Google Maps Platform APIs for the key:

- Maps JavaScript API
- Directions API
- Geocoding API
- Places API
- Places API (New)
- Telemetry API
- Maps Static API
- Street View Static API

Billing must be enabled. For browser builds, restrict the key to approved HTTP referrers. For native Capacitor builds, use an appropriate native application restriction or a separate key that is restricted according to the platform configuration. The Maps Static and Street View Static requests must also be allowed by the key restrictions.

### Install and run the client

```bash
cd BumpAlert
npm install
npm start
```

The local development app normally runs at `http://localhost:4200`.

The app now starts on the auth screen and redirects to the secured dashboard after successful login or registration.

To create a production build:

```bash
npm run build
```

To run the client tests:

```bash
npm test
```

To run linting:

```bash
npm run lint
```

### Native development

After installing client dependencies, sync the web application with Capacitor:

```bash
cd BumpAlert
npm run build
npx cap sync
```

Open the native project in its platform IDE:

```bash
npx cap open android
npx cap open ios
```

Native builds require the relevant platform SDK, signing configuration, and device permissions for motion and location access.

## How to Contribute

Contributions are welcome. Start by reviewing the open issues and existing discussions to understand current priorities.

> All contributor work should be based on the `contributors` branch, not `main`. Fork the repository and create your feature or fix branch from `contributors`, then open a pull request targeting the `contributors` branch.

1. Fork the repository from the `contributors` branch.
2. Clone your fork locally.
3. Create a focused branch from `contributors`.
4. Install the required app dependencies.
5. Make the change and add or update tests where appropriate.
6. Run the relevant build, test, and lint commands.
7. Push your branch to your fork.
8. Submit a pull request with a clear description of the change and its validation.

Please keep pull requests focused, avoid committing credentials or generated build output, and document any platform-specific setup requirements.

## License

This project is licensed under the MIT License.
