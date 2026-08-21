import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ToastController, AlertController } from '@ionic/angular';
import { TelemetryService } from '../../services/telemetry.service';
import { WakeLockService } from '../../services/wake-lock.service';
import { SensorDetectionService, LiveAcceleration, PermissionState } from '../../services/sensor-detection.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false,
})
export class SettingsPage implements OnInit, OnDestroy {
  // Appearance Preferences
  selectedTheme = 'midnight'; // 'midnight' | 'amoled'
  mapStyle = 'automotive'; // 'automotive' | 'satellite' | 'terrain'

  // Sensing & Telemetry Settings
  hapticFeedback = true;
  soundAlerts = true;
  keepScreenAwake = true;
  detectionSensitivity = 'normal'; // 'sensitive' | 'normal' | 'relaxed'

  // Live Sensor Readouts
  liveGForce = 0;
  liveAxes: LiveAcceleration = { x: 0, y: 0, z: 0 };
  permissionState: PermissionState = 'unknown';
  isSensingActive = false;

  // Civic Agency Integration
  autoSubmitConfirmed = false;
  selectedAgency = 'nhai_pwd';

  // Device Info
  appVersion = '1.2.0';
  buildNumber = '2026.08.21';

  private gForceSub?: Subscription;
  private accelSub?: Subscription;
  private permSub?: Subscription;

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

    this.gForceSub = this.sensorDetection.liveGForce$.subscribe((g) => {
      this.liveGForce = g;
      this.isSensingActive = true;
    });

    this.accelSub = this.sensorDetection.liveAcceleration$.subscribe((axes) => {
      this.liveAxes = axes;
    });

    this.permSub = this.sensorDetection.motionPermissionState$.subscribe((perm) => {
      this.permissionState = perm;
    });

  }

  ngOnDestroy(): void {
    this.gForceSub?.unsubscribe();
    this.accelSub?.unsubscribe();
    this.permSub?.unsubscribe();
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

  async requestMotionPermission(): Promise<void> {
    const granted = await this.sensorDetection.requestMotionPermission();
    if (granted) {
      await this.sensorDetection.startListening();
      this.isSensingActive = true;
      void this.toastCtrl.create({
        message: 'Motion sensing enabled and active',
        duration: 2000,
        position: 'bottom',
      }).then((t) => t.present());
    } else {
      void this.toastCtrl.create({
        message: 'Motion permission was not granted',
        duration: 3000,
        position: 'bottom',
      }).then((t) => t.present());
    }
  }

  async toggleSensing(): Promise<void> {
    if (this.isSensingActive) {
      await this.sensorDetection.stopListening();
      this.isSensingActive = false;
      void this.toastCtrl.create({
        message: 'Motion sensing paused',
        duration: 1500,
        position: 'bottom',
      }).then((t) => t.present());
    } else {
      await this.sensorDetection.startListening();
      this.isSensingActive = true;
      void this.toastCtrl.create({
        message: 'Motion sensing active',
        duration: 1500,
        position: 'bottom',
      }).then((t) => t.present());
    }
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
      header: 'Clear All Telemetry',
      message: 'Remove all recorded impact detections and start fresh with 0 reports?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear All',
          role: 'destructive',
          handler: () => {
            this.telemetryService.clearAll();
            void this.toastCtrl.create({
              message: 'All telemetry records cleared. Ready for live ride sensing.',
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
