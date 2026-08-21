import { Component } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { PwaUpdateService } from './services/pwa-update.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  constructor(private readonly pwaUpdate: PwaUpdateService) {
    this.pwaUpdate.init();
    this.configureNativeStatusBar();
  }

  private configureNativeStatusBar(): void {
    if (!Capacitor.isNativePlatform()) return;

    // Prevent fullscreen WebView controls from being placed under the
    // Dynamic Island while retaining an edge-to-edge map canvas below it.
    void StatusBar.setOverlaysWebView({ overlay: false });
    void StatusBar.setBackgroundColor({ color: '#071e28' });
    void StatusBar.setStyle({ style: Style.Light });
  }
}
