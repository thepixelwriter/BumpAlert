import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthSessionInterceptor implements HttpInterceptor {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: unknown) => {
        const isProtectedApiRequest = request.url.startsWith(environment.apiUrl)
          && !request.url.includes('/auth/');
        if (error instanceof HttpErrorResponse && error.status === 401 && isProtectedApiRequest && this.auth.isAuthenticated()) {
          this.auth.logout();
          void this.router.navigateByUrl('/auth');
        }
        return throwError(() => error);
      }),
    );
  }
}
