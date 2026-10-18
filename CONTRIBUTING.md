# Contributing to BumpAlert

Thank you for your interest in contributing to BumpAlert! This guide will help you get started.

## Welcome

BumpAlert is a mobile-first road hazard detection application that uses device motion sensors and GPS telemetry to detect and report potholes, bumps, and other road anomalies. We welcome contributions from developers, designers, testers, documentation writers, and anyone else interested in improving the project.

Whether you want to fix a bug, improve the detection algorithm, enhance the UI, add tests, or improve documentation—your contribution matters.

## Why Contribute

Road hazards affect billions of people globally. Better detection means safer commutes. Better reporting means faster civic repairs. By contributing to BumpAlert, you can:

- **Improve road safety** by enhancing detection accuracy across different vehicles, phones, road surfaces, and conditions
- **Empower citizens** with tools to report hazards directly to civic agencies
- **Build real-world impact** in a project with measurable benefit
- **Develop your skills** in mobile development, sensor processing, machine learning, backend architecture, and civic tech
- **Join a community** of developers solving transportation problems
- **Reference your contribution** in your professional portfolio and on platforms like LinkedIn

Contributors are acknowledged in the project and credited for their specific contributions.

## Areas Where Contributions Are Welcome

### Detection & Algorithms

- **Detection accuracy**: Improve bump/pothole detection logic for different vehicle types and road surfaces
- **Sensor processing**: Enhance accelerometer, gyroscope, and GPS data processing
- **False positives/negatives**: Reduce incorrect detections through better filtering and validation
- **Vehicle profiles**: Optimize detection thresholds for bikes, cars, motorcycles, or other vehicles
- **Speed and elevation**: Improve GPS speed/elevation handling for better contextual accuracy
- **Device variation**: Improve detection consistency across different phones and mount positions

### Native Platform Development

- **Android improvements**: Fix issues, add features, optimize the background detection service
- **iOS improvements**: Enhance performance, fix Safari-specific issues, improve motion permission handling
- **Platform-specific sensors**: Leverage hardware capabilities more effectively
- **Native plugin optimization**: Improve Capacitor plugin integration and performance

### User Interface & Experience

- **UI/UX improvements**: Redesign pages, improve navigation, enhance the visual hierarchy
- **Accessibility**: Add ARIA labels, keyboard navigation, screen reader support
- **Mobile responsiveness**: Ensure layouts work on all screen sizes and orientations
- **Telemetry display**: Make sensor data more understandable and actionable
- **Map integration**: Improve the hazard map visualization and interaction
- **Theme and styling**: Enhance light/dark modes and overall visual polish

### Performance & Reliability

- **Build optimization**: Reduce bundle size, improve startup time
- **Runtime performance**: Reduce memory usage, optimize detection loops
- **Error handling**: Improve error messages and recovery
- **Network resilience**: Better handling of poor connectivity
- **Logging and observability**: Add meaningful logs and diagnostics

### Features

- **Reporting workflow**: Streamline how users create and share hazard reports
- **Maps and navigation**: Improve map visualization, filtering, and navigation
- **Data export**: Allow users to export their detection history
- **Civic integration**: Better integration with civic agency workflows
- **Sharing**: Enhance the shareable hazard card generation and distribution

### Testing & Quality

- **Unit tests**: Add or expand test coverage for services, utilities, and components
- **Integration tests**: Test detection end-to-end with mock sensor data
- **E2E tests**: Test key user workflows on real devices or simulators
- **Automated checks**: Improve CI/CD pipelines and automated validation

### Documentation

- **README improvements**: Clearer setup instructions and project overview
- **Architecture documentation**: Document system design and data flow
- **API documentation**: Document backend endpoints and models
- **Setup guides**: Clearer Android/iOS development setup
- **Troubleshooting**: Common issues and their solutions
- **Contributing examples**: Walkthroughs of specific contribution types

### Infrastructure & Tooling

- **Build configuration**: Improve Angular, Ionic, Capacitor, or backend build setup
- **CI/CD**: Enhance GitHub Actions workflows or add new automated checks
- **Local development**: Improve development experience (faster builds, better debugging)
- **Dependencies**: Upgrade packages responsibly, security patches

### Civic & Community

- **Community outreach**: Help reach civic agencies, transportation organizations
- **Localization**: Translate UI or documentation into other languages
- **Partnerships**: Identify and propose integration opportunities

## Before You Start

### Check Existing Issues and Discussions

Before investing time in a contribution:

1. Search existing [Issues](https://github.com/thepixelwriter/BumpAlert/issues) for related work
2. Check [Discussions](https://github.com/thepixelwriter/BumpAlert/discussions) for ongoing conversations
3. Review open [Pull Requests](https://github.com/thepixelwriter/BumpAlert/pulls) to avoid duplicating effort

### Open an Issue or Discussion First for Major Changes

For **significant changes** (new features, algorithm changes, major refactoring, architectural decisions):

1. Open an [Issue](https://github.com/thepixelwriter/BumpAlert/issues/new) or start a [Discussion](https://github.com/thepixelwriter/BumpAlert/discussions)
2. Describe what you want to do and why
3. Wait for feedback before implementing
4. This prevents wasted effort and ensures alignment with project direction

### Bug Fixes Can Go Directly to a PR

For **small bug fixes**, you can open a PR directly without an Issue first, but it's still helpful to mention what you're fixing in the PR description.

### Detection Algorithm Changes

Changes to the detection logic are particularly important to discuss first:

- Real-world sensor data varies significantly across devices, vehicles, mounting positions, and road conditions
- A change that improves detection on one device might worsen it on another
- The best approach is to:
  1. Open an Issue describing the problem with specifics (device, vehicle type, road surface, speed range, etc.)
  2. Propose your solution and explain the detection logic change
  3. Discuss expected trade-offs
  4. Once approved, provide test data or reproducible scenarios if possible
  5. Avoid claiming improved accuracy without supporting evidence

## Development Environment

### Prerequisites

Install the following:

- **Node.js 20 or newer** (verify with `node --version`)
- **npm** (comes with Node.js; verify with `npm --version`)
- **Git** (verify with `git --version`)
- **Google Cloud project with billing enabled** — required for Google Maps API
- For iOS development:
  - **Xcode** (from the App Store)
  - **CocoaPods** (install via `sudo gem install cocoapods`)
- For Android development:
  - **Android Studio** (download from [developer.android.com](https://developer.android.com/studio))
  - **JDK 17+** (usually installed by Android Studio)
  - Android SDK with API level 34 or higher

### Verify Your Environment

```bash
node --version     # Should be v20 or higher
npm --version      # Should be 10 or higher
git --version
```

## Getting the Source Code

### Fork the Repository

Contributors should fork from the repository's `contributors` branch and use it as the base for all feature work and fixes.

1. Visit [https://github.com/thepixelwriter/BumpAlert](https://github.com/thepixelwriter/BumpAlert)
2. Click **Fork** in the top-right corner
3. Clone your fork locally:

```bash
git clone https://github.com/YOUR_USERNAME/BumpAlert.git
cd BumpAlert
```

### Add Upstream Remote

To keep your fork in sync with the main repository's `contributors` branch:

```bash
git remote add upstream https://github.com/thepixelwriter/BumpAlert.git
git fetch upstream
git checkout contributors
git pull upstream contributors
```

### Create a Working Branch

Always work on a dedicated branch, never directly on `contributors`:

```bash
git checkout -b feature/your-feature-name contributors
```

When opening a pull request, target the repository's `contributors` branch rather than `main`.

### Install Dependencies

From the project root:

```bash
npm install
```

## Branch Naming

Use clear, descriptive branch names, and base them off `contributors`:

- **Feature**: `feature/add-bike-detection-improvements`
- **Bug fix**: `fix/map-not-loading-on-ios`
- **Documentation**: `docs/add-detection-algorithm-guide`
- **Refactor**: `refactor/simplify-sensor-service`
- **Tests**: `test/add-motion-listener-tests`

All pull requests for community contributions should target the `contributors` branch.

## Configuration and Secrets

### Google Maps API Key

BumpAlert uses the Google Maps JavaScript, Static, and Street View APIs. You need an API key for development.

1. Create a Google Cloud project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable billing (required for Maps APIs)
3. Enable these APIs:
   - Maps JavaScript API
   - Maps Static API
   - Street View Static API
   - Places API
4. Create an API key in **Credentials**
5. Create a `.env` file in the project root:

```dotenv
GOOGLE_MAPS_API_KEY=your_actual_api_key_here
GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

The build script reads this file and generates a runtime environment configuration. Set `GOOGLE_CLIENT_ID` to enable Google sign-in in the client, and configure the same ID as the API Worker's `GOOGLE_CLIENT_ID` secret so the backend can verify credentials. For GitHub Actions deployment, add both values as repository Actions secrets. **Never commit `.env` to Git.**

### Environment Variable Priority

The build script checks environment variables in this order:

1. `.env` file (local development)
2. `process.env.GOOGLE_MAPS_API_KEY` (CI/CD, GitHub Actions)
3. `process.env.MAPS_API_KEY` (fallback)
4. `process.env.GOOGLE_MAPS_KEY` (fallback)

### Secrets Best Practice

**NEVER commit the following to Git:**

- `.env` file
- API keys or tokens
- Passwords or credentials
- Generated environment files
- Private configuration

These will be rejected by CI/CD checks. If you accidentally commit secrets:

1. Remove them immediately
2. Regenerate the key in Google Cloud Console or Cloudflare
3. See [GitHub's secret scanning guide](https://docs.github.com/en/code-security/secret-scanning)

### Backend Server Environment

If working on `bumpAlertServer`, copy the example environment:

```bash
cd ../bumpAlertServer
cp .env.example .env
```

Edit `.env` with your local MongoDB URI and other settings:

```dotenv
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/bumpalert
CORS_ORIGIN=*
```

## Coding Guidelines

### TypeScript

- Use `strict: true` settings (already enforced in `tsconfig.json`)
- Prefer explicit types over `any`
- Use const where possible, avoid reassignment
- Declare return types on functions

```typescript
// Good
function processDetection(gForce: number): HazardSeverity | null {
  return gForce > 2.0 ? 'severe' : null;
}

// Avoid
function processDetection(gForce: any): any {
  // ...
}
```

### Angular Components & Services

- Use **standalone components** where possible (modern Angular pattern)
- Use **dependency injection** for services—never instantiate services directly
- Implement `OnInit`, `OnDestroy` when needed
- Follow component/service naming conventions:
  - Component selector prefix: `app-` (e.g., `app-detection`)
  - Component file: `*.component.ts`
  - Service file: `*.service.ts`
  - Page file: `*.page.ts`

```typescript
// Good: Standalone component with DI
@Component({
  selector: 'app-detection',
  standalone: true,
  imports: [CommonModule],
})
export class DetectionComponent implements OnInit {
  constructor(private sensorService: SensorDetectionService) {}
}

// Avoid: Creating service directly
export class DetectionComponent {
  private sensor = new SensorDetectionService(); // Don't do this
}
```

### RxJS Observables

- Use observables for asynchronous data (sensor events, location updates)
- Unsubscribe properly in `ngOnDestroy` to prevent memory leaks
- Prefer reactive patterns over imperative callbacks

```typescript
// Good: Proper subscription management
ngOnInit() {
  this.sub = this.sensorService.gForce$.subscribe(value => {
    this.currentValue = value;
  });
}

ngOnDestroy() {
  this.sub?.unsubscribe();
}
```

### Error Handling

- Always handle promise rejections and observable errors
- Use `try-catch` for async/await
- Log errors with context for debugging

```typescript
// Good
async loadData() {
  try {
    const data = await this.fetchData();
    this.data = data;
  } catch (error) {
    console.error('Failed to load data', error);
    this.showError('Could not load data. Please try again.');
  }
}
```

### Logging

- Use `console.error()` for errors
- Use `console.warn()` for warnings
- Use `console.info()` for informational messages (e.g., optional features not available)
- Avoid `console.log()` in production code; remove or make conditional
- Include context in log messages

```typescript
console.error('BumpAlert: Motion detection failed', error);
console.info('BumpAlert: Compass permission not available', error);
```

### Comments and Documentation

- Write clear comments explaining the **why**, not the what
- Document complex algorithms and assumptions
- Use JSDoc for public functions and services

```typescript
/**
 * Detects a pothole from accelerometer data using a 3D vector magnitude.
 * Handles devices in any orientation.
 * @param event - Raw accelerometer event
 * @param axes - Extracted X/Y/Z axes
 * @returns G-force delta from Earth gravity
 */
private calculateGForce(event: AccelListenerEvent, axes: LiveAcceleration): number {
  // Complex calculation explained...
}
```

### Code Organization

- Keep functions and services focused and single-purpose
- Use interfaces to define data contracts
- Group related functionality together
- Extract reusable logic into utilities or services

### Angular Naming Conventions

The project enforces naming conventions via ESLint:

- **Components**: Must end with `Component` or `Page` suffix (e.g., `DetectionPage`)
- **Selectors**: Prefix with `app-` and use kebab-case (e.g., `app-detection`)
- **Directives**: Prefix with `app` and use camelCase (e.g., `appHighlight`)

## Sensor and Detection Contributions

### Importance of Careful Testing

Detection logic is the core of BumpAlert. Real-world sensor data varies significantly:

- **Different phones**: Different accelerometer sensitivity, noise floor, sampling rates
- **Different vehicles**: Cars vs. motorcycles vs. bikes have different suspension characteristics
- **Different mounting positions**: Dashboard, handlebar, windshield, pocket, backpack
- **Different road surfaces**: Asphalt, concrete, gravel, potholes vary in impact signature
- **Different speeds**: A bump at 5 km/h feels different from one at 50 km/h
- **Different conditions**: Wet roads, weather, temperature can affect sensor readings

### How to Contribute Detection Improvements

If you're improving detection logic:

1. **Describe the problem clearly**:
   - What false positives or false negatives did you observe?
   - On which device, vehicle type, and road conditions?
   - Can you reproduce it consistently?

2. **Explain your solution**:
   - What specific detection logic are you changing?
   - Why should this fix the problem?
   - What assumptions or trade-offs does your change make?

3. **Provide evidence**:
   - If possible, share test data (accelerometer recordings, GPS traces)
   - Describe reproducible scenarios
   - Test on multiple devices if possible

4. **Consider side effects**:
   - Will this improve detection on one vehicle type but worsen it on another?
   - What false negative rate are you introducing?
   - Is there a better alternative that doesn't trade accuracy in one area for another?

5. **Avoid overclaiming**:
   - Don't claim "improved accuracy" without supporting data
   - Be specific: "Reduces false positives for motorcycles on rough roads" is better than "Improved accuracy"
   - Document assumptions and known limitations

### Detection Profiles

The project uses separate profiles for bikes and cars:

- **Bike**: Higher G-force thresholds (bikes are lighter, bump more easily)
  - Moderate: 1.8G, Severe: 2.2G, Alarming: 4.0G
- **Car**: Lower G-force thresholds (heavier vehicle, better suspension)
  - Moderate: 0.9G, Severe: 1.5G, Alarming: 3.2G

Changes to these thresholds should be accompanied by real test data showing improvement across representative scenarios.

## Testing

### Client-Side Tests

The client uses **Karma**, **Jasmine**, and **Chrome** for unit testing:

```bash
# Run tests once
npm test

# Run tests with coverage
npm test -- --code-coverage
```

Coverage reports are generated in `coverage/app/`.

### Linting

The project uses **ESLint** with Angular-specific rules:

```bash
# Check for linting errors
npm run lint
```

### Production Build

Before submitting a PR, ensure the production build succeeds:

```bash
# Build for production
npm run build -- --configuration production
```

### Server Tests (if modifying backend)

The backend uses **Vitest** for testing:

```bash
cd ../bumpAlertServer
npm test
npm run lint
```

### Pre-PR Checklist

Before pushing your branch, run:

```bash
npm run lint
npm test
npm run build -- --configuration production
```

All checks must pass before opening a PR.

## Android and iOS Testing

### Android Development

After building, sync with Capacitor and open in Android Studio:

```bash
npm run build
npx cap sync
npx cap open android
```

Then:

1. Open the project in Android Studio
2. Select a device or emulator
3. Click **Run** to build and install the app
4. Test the feature on the actual device or emulator

Android device requirements:

- Android 9 (API 28) or higher
- Motion sensor permissions
- Location permissions

### iOS Development

After building, sync with Capacitor and open in Xcode:

```bash
npm run build
npx cap sync
npx cap open ios
```

Then:

1. Open the `.xcworkspace` file in Xcode (not `.xcodeproj`)
2. Select a device or simulator
3. Click **Run** to build and install the app
4. Test the feature on the actual device or simulator

iOS simulator limitations:

- **Motion sensors are not available** in the simulator
- Use a **real device** to test motion/acceleration features
- iOS requires explicit motion permission via a user gesture

### Key Permissions to Test

- **Motion & Orientation** (iOS Safari-specific)
- **Location** (required for GPS features)
- **Geolocation accuracy** (affects detection confidence)

## Pull Request Process

### 1. Create a Focused Branch

```bash
git checkout -b feature/your-description
```

### 2. Make Your Changes

- Make focused, logical commits
- Don't mix unrelated changes (e.g., refactoring + bug fix)
- Write clear commit messages (see [Commit Guidelines](#commit-guidelines))

### 3. Add or Update Tests

Where practical:

- Add unit tests for new services or utilities
- Add integration tests for complex features
- Update existing tests if behavior changes

### 4. Run Linting, Tests, and Build

```bash
npm run lint
npm test
npm run build -- --configuration production
```

All checks must pass.

### 5. Push to Your Fork

```bash
git push origin feature/your-description
```

### 6. Open a Pull Request

1. Go to [https://github.com/thepixelwriter/BumpAlert](https://github.com/thepixelwriter/BumpAlert)
2. Click **New Pull Request**
3. Select your branch
4. Fill in the PR template with:
   - **Title**: Clear, descriptive summary (e.g., "Fix map not loading on iOS 17")
   - **Description**: Explain what changed and why
   - **Testing**: Describe how you tested the change
   - **Screenshots/Video**: For UI changes, include before/after screenshots or videos
   - **Platform Notes**: If the change is platform-specific, mention which platforms you tested on

Example PR description:

```markdown
## What
Fix iOS map not loading due to deprecated Google Maps API usage.

## Why
iOS Safari 17+ requires the new Google Maps API syntax. The old syntax silently fails.

## How
- Updated Google Maps initialization to use new async syntax
- Tested on iOS 16 and 17 devices
- Verified no map console errors

## Screenshots
[Before] Map doesn't show
[After] Map loads correctly

## Platforms Tested
- iOS 17 on iPhone 14
- iOS 16 on iPhone 12
```

### 7. Respond to Review Feedback

- Be open to suggestions
- Ask for clarification if a comment is unclear
- Update your branch with new commits (don't force-push after review begins)
- Re-request review once you've addressed feedback

## Pull Request Guidelines

### What Makes a Good PR

- **Focused**: Addresses a single concern (feature, bug, docs, refactor)
- **Tested**: All new code is covered by tests where practical
- **Documented**: Explains the change and its rationale
- **Clean**: No unnecessary commits, no debug code
- **Accessible**: Includes screenshots/videos for UI changes
- **Platform-aware**: Notes any platform-specific behavior or testing

### What to Avoid

- **Unrelated changes**: Don't mix refactoring with bug fixes in one PR
- **Generated files**: Don't commit `node_modules/`, `dist/`, `.angular/`, or `www/` builds
- **Secrets or credentials**: Absolutely no API keys, tokens, or passwords
- **Unnecessary dependencies**: Don't add dependencies without discussion
- **Large refactors**: If major restructuring is needed, open an Issue first

### Size Matters

Smaller PRs are easier to review and merge faster:

- Aim for under 400 lines of code changes (excluding tests)
- If your change is larger, split it into multiple focused PRs
- Very large changes can be discussed upfront in an Issue

## Commit Guidelines

Write clear, descriptive commit messages:

```bash
git commit -m "Fix detection failing on iPhone 12 with iOS 17"
git commit -m "Add unit tests for GForce calculation"
git commit -m "Refactor sensor service to reduce memory usage"
```

### Commit Message Format

- **First line**: Clear summary (50 characters or less)
- **Blank line**
- **Body** (optional): Explain the why and how in 2-3 sentences

```
Fix iOS motion permission not persisting across app relaunches

The motion permission state was lost because it wasn't being
persisted to localStorage. Now we save the state so users don't
have to re-grant permission every time they open the app.
```

### Avoid

- Commits with generic messages like "fix" or "update"
- Very large monolithic commits (split into logical units)
- Commits mixing multiple unrelated changes

## Issue Reporting

### For Bug Reports

When reporting a bug, include:

- **Device model** (e.g., iPhone 14 Pro, Pixel 7)
- **OS version** (e.g., iOS 17, Android 14)
- **App version** or commit hash (from app settings or git)
- **Vehicle type** (bike, car, motorcycle, etc.)
- **Approximate speed** when the issue occurred
- **Road condition** (smooth asphalt, rough, gravel, etc.)
- **Expected behavior**: What should have happened
- **Actual behavior**: What actually happened
- **Steps to reproduce**: Exact steps to reproduce the issue
- **Logs or screenshots**: Console errors, app logs, screenshots
- **Platform-specific notes**: Is this iOS-only, Android-only, or both?

Example:

```markdown
## Device
iPhone 14 Pro, iOS 17.1

## App Version
v0.0.1, commit abc123

## Vehicle & Context
Bike commute on rough cobblestone street at ~10 km/h

## Expected Behavior
App detects large bump in road

## Actual Behavior
App detects 10+ false positives within 1 second, then stops detecting

## Steps to Reproduce
1. Open app in Bike mode
2. Place on bike handlebar
3. Ride on cobblestone street
4. Observe detection log

## Logs
```
[21:30:15] Severe bump detected
[21:30:15] Severe bump detected
[21:30:15] Severe bump detected
[21:30:16] Moderate bump detected
(no more detections)
```

## Screenshots
[Attached: false positive notifications screenshot]
```

## Feature Requests

When proposing a feature, describe:

- **Use case**: Why is this feature needed? Who benefits?
- **Proposed solution**: How should it work from the user's perspective?
- **Alternatives considered**: Are there other approaches?
- **Impact**: Would this change existing functionality or add new capability?

Example:

```markdown
## Feature
Allow users to mute detection for a specific road/area

## Use Case
On my commute, there's a rough cobblestone street that generates
excessive false positives. I'd like to exclude that specific area
from detection without disabling the app entirely.

## Proposed Solution
- Add a "Mute Area" button in the detection page
- Show a 500m radius around the current GPS location
- Store muted areas locally
- Skip detection if user is within a muted area

## Alternatives
- Global filter for all detection (less useful)
- Blacklist by road name (requires database and geocoding)
```

## Documentation Contributions

Documentation is vital for new contributors. We welcome improvements to:

- **README.md**: Getting started, features, project overview
- **Setup guides**: Clearer instructions for Android/iOS/Google Maps setup
- **Architecture documentation**: How the detection, storage, and reporting systems work
- **API documentation**: Backend endpoints and data models
- **Code comments**: Complex algorithms explained
- **Examples**: Sample detection profiles, test data, integration examples
- **Troubleshooting**: Common issues and solutions

Submit documentation changes via pull request just like code changes. Follow the same review process.

## Recognition

Meaningful contributors are acknowledged in the project. This can include:

- **Contributors list**: Added to a CONTRIBUTORS file or project README
- **Release notes**: Credit in version release notes for significant contributions
- **Commit history**: Your commits remain in the project's permanent history
- **Professional credit**: You can reference your specific contribution in your portfolio, LinkedIn, resume, or GitHub profile

Example portfolio reference:

> "Contributed to BumpAlert: Improved iOS motion sensor accuracy detection, reducing false positives by 35% for bike riders on rough surfaces."

## Code of Conduct

We're committed to providing a welcoming and respectful community. All contributors and participants are expected to:

- Treat each other with respect and kindness
- Be inclusive and welcoming to people of all backgrounds
- Provide constructive feedback
- Focus on ideas, not individuals
- Be patient with new contributors

If you experience or witness disrespectful behavior, please contact the project maintainers.

## Security

If you discover a security vulnerability, **please do not open a public Issue**. Instead:

1. Email the maintainer directly (details can be found in the repository)
2. Describe the vulnerability clearly
3. Provide steps to reproduce if possible
4. Allow time for a patch before public disclosure

Security vulnerabilities in dependencies should also be reported privately. Thank you for helping keep BumpAlert secure.

## License

BumpAlert is licensed under the **MIT License**. By contributing, you agree that your contributions are licensed under the same MIT License.

See [LICENSE](LICENSE) for details.

The MIT License is permissive and allows commercial use, modification, and distribution, as long as the original license and copyright notice are included.

## Questions and Community

- **GitHub Issues**: For bugs, feature requests, and focused discussions
- **GitHub Discussions**: For broader questions, architecture discussions, and community conversation
- **Pull Requests**: For code review and implementation feedback

Please use the right channel:

- Issues are for specific problems or features
- Discussions are for questions, ideas, and brainstorming
- PRs are for ready-to-merge code

## Final Checklist

Before submitting your pull request, verify:

- [ ] **Focused change**: My PR addresses a single concern
- [ ] **No secrets**: I haven't committed `.env`, API keys, or credentials
- [ ] **Tests pass**: `npm test` runs without errors
- [ ] **Lint passes**: `npm run lint` shows no errors
- [ ] **Build passes**: `npm run build -- --configuration production` succeeds
- [ ] **Documentation**: README, code comments, or CONTRIBUTING updated if behavior changed
- [ ] **Screenshots/video**: Included for UI changes
- [ ] **Platform notes**: I've noted which platforms I tested on
- [ ] **PR description**: Clear explanation of what changed, why, and how it was tested
- [ ] **No unnecessary files**: No `node_modules/`, `dist/`, `www/`, or build output committed

## What to Expect

- **Initial review**: Within a few days (we're mostly volunteers)
- **Feedback**: Clear and constructive comments on code, tests, and documentation
- **Iterations**: Multiple rounds of feedback are normal—don't be discouraged
- **Merge**: Once approved, your PR will be merged to the `contributors` branch
- **Recognition**: You'll be credited for your contribution

## Get Help

Stuck? Have questions?

- Read existing Issues and Discussions for similar problems
- Check the README for common setup issues
- Ask questions in a GitHub Discussion
- Open an Issue with your question and context

Welcome aboard! 🚀
