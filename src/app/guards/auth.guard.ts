import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  canActivate(): Observable<boolean | UrlTree> | boolean | UrlTree {
    const loginRoute = this.router.createUrlTree(['/auth']);
    if (!this.auth.isAuthenticated()) {
      return loginRoute;
    }

    return this.auth.validateSession().pipe(
      map(({ valid }) => {
        if (valid) {
          return true;
        }

        this.auth.logout();
        return loginRoute;
      }),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.auth.logout();
          return of(loginRoute);
        }

        if (error instanceof HttpErrorResponse && error.status !== 0) {
          console.warn('Unable to validate the saved session; continuing in offline mode.', error.message);
        }

        return of(true);
      }),
    );
  }
}
