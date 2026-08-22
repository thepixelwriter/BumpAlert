import { Injectable } from '@angular/core';
import { Share } from '@capacitor/share';
import { environment } from '../../environments/environment';
import { PotholeReport } from '../models/pothole-report.model';

export interface GrievanceShareOptions {
  report: PotholeReport;
  customNotes?: string;
}

@Injectable({
  providedIn: 'root',
})
export class GrievanceShareService {
  /**
   * Generates Google Static Map URL with maximum zoom (zoom=18).
   */
  getStaticMapUrl(latitude: number, longitude: number, width = 640, height = 400, mapType = 'roadmap'): string {
    const apiKey = environment.googleMapsApiKey;
    const markerColor = 'red';
    return `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}&zoom=18&size=${width}x${height}&scale=2&maptype=${mapType}&markers=color:${markerColor}%7C${latitude},${longitude}&key=${apiKey}`;
  }

  /**
   * Creates an HTML5 Canvas combining the static map snapshot with a high-contrast
   * motorcycle telemetry impact statistics banner.
   */
  async generateGrievanceCardDataUrl(report: PotholeReport): Promise<string> {
    const canvas = document.createElement('canvas');
    const width = 800;
    const height = 600;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }

    // 1. Draw base background (Midnight Onyx)
    ctx.fillStyle = '#0e131b';
    ctx.fillRect(0, 0, width, height);

    // 2. Try drawing static map image
    const mapUrl = this.getStaticMapUrl(report.latitude, report.longitude, 800, 380);
    try {
      const mapImg = await this.loadImage(mapUrl);
      ctx.drawImage(mapImg, 0, 0, width, 380);
    } catch {
      // Fallback: draw stylish map grid if static map image CORS fails
      this.drawMapGridFallback(ctx, width, 380, report);
    }

    // 3. Draw gradient separator overlay over map
    const gradient = ctx.createLinearGradient(0, 260, 0, 380);
    gradient.addColorStop(0, 'rgba(14, 19, 27, 0)');
    gradient.addColorStop(1, '#0e131b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 260, width, 120);

    // 4. Draw Header Banner
    ctx.fillStyle = 'rgba(14, 19, 27, 0.9)';
    ctx.fillRect(0, 0, width, 56);

    ctx.fillStyle = report.severity === 'alarming' ? '#f87171' : '#fb923c';
    ctx.font = '600 18px -apple-system, system-ui, sans-serif';
    ctx.fillText('BUMPALERT ROAD HAZARD GRIEVANCE', 24, 35);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(new Date(report.timestamp).toLocaleString(), width - 24, 35);
    ctx.textAlign = 'left';

    // 5. Draw Impact Stats Box (Glassmorphism card in lower section)
    const cardY = 390;
    ctx.fillStyle = '#17202c'; // Soft Slate Surface
    this.roundRect(ctx, 24, cardY, width - 48, 185, 14);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.08)';
    ctx.stroke();

    // Severity Badge Pill
    const isAlarming = report.severity === 'alarming';
    ctx.fillStyle = isAlarming ? 'rgba(239, 68, 68, 0.12)' : 'rgba(249, 115, 22, 0.12)';
    this.roundRect(ctx, 44, cardY + 20, 160, 30, 8);
    ctx.fill();
    ctx.strokeStyle = isAlarming ? 'rgba(239, 68, 68, 0.28)' : 'rgba(249, 115, 22, 0.28)';
    ctx.stroke();

    ctx.fillStyle = isAlarming ? '#f87171' : '#fb923c';
    ctx.font = '600 13px -apple-system, system-ui, sans-serif';
    ctx.fillText(
      isAlarming ? 'ALARMING IMPACT' : 'SEVERE POTHOLE',
      56,
      cardY + 40,
    );

    // Peak G-Force metric
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 32px -apple-system, system-ui, sans-serif';
    ctx.fillText(`${report.gForce.toFixed(2)} G`, 220, cardY + 46);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px -apple-system, system-ui, sans-serif';
    ctx.fillText('Peak Telemetry Spike', 340, cardY + 44);

    // Coordinates & Location details
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(
      `GPS: ${report.latitude.toFixed(6)}° N, ${report.longitude.toFixed(6)}° E`,
      44,
      cardY + 95,
    );

    ctx.fillStyle = '#38bdf8';
    ctx.font = '13px -apple-system, system-ui, sans-serif';
    ctx.fillText(
      `Location Map: https://www.google.com/maps?q=${report.latitude},${report.longitude}`,
      44,
      cardY + 124,
    );

    // Civic Action Tag footer
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px -apple-system, system-ui, sans-serif';
    ctx.fillText(
      'Civic Grievance Tag: #FixOurRoads #BumpAlert #SafeRiding @PWD @NHAI',
      44,
      cardY + 154,
    );

    return canvas.toDataURL('image/png');
  }

  /**
   * Triggers native platform share sheet via Capacitor Share API with fallback.
   */
  async shareGrievance(report: PotholeReport): Promise<void> {
    const mapsLink = `https://www.google.com/maps?q=${report.latitude},${report.longitude}`;
    const shareText = `🚨 Road Hazard Alert!\nSevere pothole detected by BumpAlert telemetry with ${report.gForce.toFixed(2)}G impact at ${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}.\n\nLocation: ${mapsLink}\n\n#FixOurRoads #BumpAlert @NHAI_Official @MoRTHIndia`;

    try {
      let dataUrl = '';
      try {
        dataUrl = await this.generateGrievanceCardDataUrl(report);
      } catch (err) {
        console.warn('Canvas generator warning:', err);
      }

      const canShare = await Share.canShare();
      if (canShare.value) {
        await Share.share({
          title: `BumpAlert Hazard Report (${report.gForce.toFixed(2)}G)`,
          text: shareText,
          url: mapsLink,
          dialogTitle: 'Share Road Hazard Grievance',
        });
      } else if (navigator.share) {
        await navigator.share({
          title: `BumpAlert Hazard Report (${report.gForce.toFixed(2)}G)`,
          text: shareText,
          url: mapsLink,
        });
      } else {
        // Fallback: Copy to clipboard or trigger image download
        this.downloadDataUrl(dataUrl, `bumpalert-grievance-${report.id}.png`);
        window.open(mapsLink, '_blank');
      }
    } catch (error) {
      console.warn('BumpAlert: share sheet dismissed or error', error);
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }

  private drawMapGridFallback(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    report: PotholeReport,
  ): void {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Center marker pin
    const cx = width / 2;
    const cy = height / 2;
    ctx.fillStyle = report.severity === 'alarming' ? '#f43f5e' : '#f59e0b';
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`GPS: ${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`, cx, cy + 36);
    ctx.textAlign = 'left';
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private downloadDataUrl(dataUrl: string, filename: string): void {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }
}
