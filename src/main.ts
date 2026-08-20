import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

// Opt-in on-device console (open with ?debug=1) - lets us see errors on iPhone Safari without a Mac.
if (new URLSearchParams(window.location.search).get('debug') === '1') {
  import('eruda').then((eruda) => eruda.default.init());
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.log(err));
