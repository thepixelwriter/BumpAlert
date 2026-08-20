import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

// Always-on in dev builds - lets us see errors on iPhone Safari without a Mac (no URL param needed).
if (!environment.production) {
  import('eruda').then((eruda) => eruda.default.init());
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.log(err));
