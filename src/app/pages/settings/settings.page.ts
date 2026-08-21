import { Component, OnInit } from '@angular/core';
import { ToastController, AlertController } from '@ionic/angular';
import { TelemetryService } from '../../services/telemetry.service';
import { WakeLockService } from '../../services/wake-lock.service';
import { SensorDetectionService } from '../../services/sensor-detection.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false,
})
export class SettingsPage implements OnInit {
  // Appearance Preferences
  selectedTheme = 'midnight'; // 'midnight' | 'amoled'
  mapStyle = 'automotive'; // 'automotive' | 'satellite' | 'terrain'

  // Sensing & Telemetry Settings
  hapticFeedback = true;
  soundAlerts = true;
  keepScreenAwake = true;
  detectionSensitivity = 'normal'; // 'sensitive' | 'normal' | 'relaxed'

  // Civic Agency Integration
  autoSubmitConfirmed = false;
  selectedAgency = 'nhai_pwd';

  // Device Info
  appVersion = '1.2.0';
  buildNumber = '2026.08.21';

  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly wakeLock: WakeLockService,
    private readonly sensorDetection: SensorDetectionService,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController,
  ) {}

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('bumpalert_theme');
    if (savedTheme) this.selectedTheme = savedTheme;

    const savedHaptic = localStorage.getItem('bumpalert_haptic');
    if (savedHaptic !== null) this.hapticFeedback = savedHaptic === 'true';

    const savedWake = localStorage.getItem('bumpalert_wake');
    if (savedWake !== null) this.keepScreenAwake = savedWake === 'true';
  }

  onThemeChange(theme: string): void {
    this.selectedTheme = theme;
    localStorage.setItem('bumpalert_theme', theme);
    document.body.classList.toggle('amoled-mode', theme === 'amoled');
  }

  onWakeLockToggle(): void {
    localStorage.setItem('bumpalert_wake', String(this.keepScreenAwake));
    if (this.keepScreenAwake) {
      void this.wakeLock.enable();
    } else {
      void this.wakeLock.disable();
    }
  }

  onHapticToggle(): void {
    localStorage.setItem('bumpalert_haptic', String(this.hapticFeedback));
  }

  async exportTelemetryJson(): Promise<void> {
    this.telemetryService.rawReports$.subscribe((reports) => {
      const payload = JSON.stringify(reports, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bumpalert-telemetry-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });

    const toast = await this.toastCtrl.create({
      message: 'Telemetry JSON log exported',
      duration: 2000,
      position: 'bottom',
    });
    await toast.present();
  }

  async clearAllData(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Reset All Data',
      message: 'Clear all recorded telemetry and reset to default dataset?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Reset',
          role: 'destructive',
          handler: () => {
            this.telemetryService.resetToSeedData();
            void this.toastCtrl.create({
              message: 'Telemetry data reset to default',
              duration: 2000,
              position: 'bottom',
            }).then((t) => t.present());
          },
        },
      ],
    });
    await alert.present();
  }

  async openPolicy(type: 'privacy' | 'terms'): Promise<void> {
    const title = type === 'privacy' ? 'Privacy Policy' : 'Terms of Service';
    const message =
      type === 'privacy'
        ? 'BumpAlert processes accelerometer and GPS coordinates locally on your device for road anomaly detection. No continuous background location is sold or tracked outside active ride monitoring.'
        : 'BumpAlert is an open civic assistance tool. Telemetry reports help map road infrastructure quality for civic authorities (PWD, NHAI, MoRTH). Always ride safely and maintain focus on the road.';

    const alert = await this.alertCtrl.create({
      header: title,
      message,
      buttons: ['Understood'],
    });
    await alert.present();
  }
}
