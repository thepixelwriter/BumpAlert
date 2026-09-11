import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface ReportApiRecord {
  id: string;
  userId: string;
  deviceId?: string | null;
  submittedAt: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  severity: 'moderate' | 'severe' | 'alarming';
  gForce: number;
  status: 'pending' | 'confirmed' | 'dismissed' | 'submitted';
  metadata: Record<string, unknown>;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ReportApiService {
  private readonly apiUrl = 'http://localhost:3000/api';

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {}

  submitReports(payload: { deviceId?: string; submittedAt: number; hazards: Array<{ latitude: number; longitude: number; timestamp: number; severity: string; gForce?: number }> }): Observable<{ inserted: number; reports: ReportApiRecord[] }> {
    return this.http.post<{ inserted: number; reports: ReportApiRecord[] }>(`${this.apiUrl}/reports`, payload, {
      headers: this.auth.getAuthHeaders(),
    });
  }

  getReports(page = 1, limit = 50, status?: string): Observable<{ page: number; limit: number; total: number; reports: ReportApiRecord[] }> {
    let params = new HttpParams().set('page', String(page)).set('limit', String(limit));
    if (status) {
      params = params.set('status', status);
    }

    return this.http.get<{ page: number; limit: number; total: number; reports: ReportApiRecord[] }>(`${this.apiUrl}/reports`, {
      params,
      headers: this.auth.getAuthHeaders(),
    });
  }

  getNearbyReports(lat: number, lng: number, radiusMeters = 2000): Observable<{ reports: ReportApiRecord[] }> {
    const params = new HttpParams().set('lat', String(lat)).set('lng', String(lng)).set('radiusMeters', String(radiusMeters));
    return this.http.get<{ reports: ReportApiRecord[] }>(`${this.apiUrl}/reports/nearby`, {
      params,
      headers: this.auth.getAuthHeaders(),
    });
  }

  updateReportStatus(reportId: string, status: string): Observable<{ report: ReportApiRecord }> {
    return this.http.patch<{ report: ReportApiRecord }>(`${this.apiUrl}/reports/${reportId}/status`, { status }, {
      headers: this.auth.getAuthHeaders(),
    });
  }
}
