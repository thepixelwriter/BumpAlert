import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthResponse, AuthService } from './auth.service';
import { environment } from '../../environments/environment';

describe('AuthService login retry behavior', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;
  const loginUrl = `${environment.apiUrl}/auth/login`;
  const credentials = { email: 'driver@example.com', password: 'not-a-real-password' };
  const loginResponse: AuthResponse = {
    token: 'session-token',
    user: { id: 'user-1', name: 'Test Driver', email: credentials.email, provider: 'local' },
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AuthService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('retries once after a gateway timeout and stores the successful session', fakeAsync(() => {
    let response: AuthResponse | undefined;
    service.login(credentials).subscribe((result) => response = result);

    httpTesting.expectOne(loginUrl).flush(
      { error: 'Gateway Timeout' },
      { status: 504, statusText: 'Gateway Timeout' },
    );
    tick(750);

    httpTesting.expectOne(loginUrl).flush(loginResponse);

    expect(response).toEqual(loginResponse);
    expect(service.token).toBe(loginResponse.token);
  }));

  it('does not retry authentication errors', () => {
    let responseError: HttpErrorResponse | undefined;
    service.login(credentials).subscribe({ error: (error: HttpErrorResponse) => responseError = error });

    httpTesting.expectOne(loginUrl).flush(
      { error: 'Invalid email or password' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(responseError?.status).toBe(401);
    expect(httpTesting.match(loginUrl)).toHaveSize(0);
  });
});
