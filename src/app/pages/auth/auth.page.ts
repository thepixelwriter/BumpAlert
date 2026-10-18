import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth',
  templateUrl: './auth.page.html',
  styleUrls: ['./auth.page.scss'],
  standalone: false,
})
export class AuthPage implements OnInit {
  mode: 'login' | 'register' | 'forgot' = 'login';
  authForm: FormGroup;
  isSubmitting = false;
  submitError = '';
  showPassword = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly toastCtrl: ToastController,
    private readonly router: Router,
  ) {
    this.authForm = this.fb.group({
      name: ['', [Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      this.router.navigateByUrl('/tabs/map');
    }
  }

  switchMode(mode: 'login' | 'register' | 'forgot'): void {
    this.mode = mode;
    this.submitError = '';
    this.showPassword = false;
    this.authForm.markAsPristine();
    this.authForm.markAsUntouched();
    if (mode === 'forgot') {
      this.authForm.get('password')?.clearValidators();
      this.authForm.get('password')?.updateValueAndValidity();
    } else {
      this.authForm.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
      this.authForm.get('password')?.updateValueAndValidity();
    }

    if (mode === 'register') {
      this.authForm.get('name')?.setValidators([Validators.required, Validators.minLength(2)]);
    } else {
      this.authForm.get('name')?.clearValidators();
    }
    this.authForm.get('name')?.updateValueAndValidity();
  }

  async submit(): Promise<void> {
    if (this.authForm.invalid) {
      this.authForm.markAllAsTouched();
      this.submitError = 'Please correct the highlighted fields before continuing.';
      return;
    }

    this.isSubmitting = true;
    this.submitError = '';
    const formValue = this.authForm.value;

    try {
      if (this.mode === 'register') {
        await this.auth.register({ name: formValue.name, email: formValue.email, password: formValue.password }).toPromise();
        this.showToast('Account created successfully');
      } else if (this.mode === 'forgot') {
        await this.auth.forgotPassword(formValue.email).toPromise();
        this.showToast('If an account exists, check your email for a reset link');
        this.authForm.reset();
        this.switchMode('login');
        return;
      } else {
        await this.auth.login({ email: formValue.email, password: formValue.password }).toPromise();
        this.showToast('Welcome back');
      }

      await this.router.navigateByUrl('/tabs/map');
    } catch (error) {
      const responseError = (error as { error?: { error?: string } | string; message?: string }).error;
      const message = typeof responseError === 'string'
        ? responseError
        : responseError?.error ?? (error as { message?: string }).message ?? 'Action failed';
      this.submitError = message;
      this.showToast(message);
    } finally {
      this.isSubmitting = false;
    }
  }

  hasError(controlName: string, error: string): boolean {
    const control = this.authForm.get(controlName);
    return !!control && control.touched && control.hasError(error);
  }

  async continueToResetPage(): Promise<void> {
    await this.router.navigateByUrl('/reset-password');
  }

  async continueWithGoogle(): Promise<void> {
    if (!environment.googleClientId) {
      await this.showToast('Google sign in is not configured');
      return;
    }

    const googleClient = (window as typeof window & { google?: { accounts?: { id?: { initialize: (config: Record<string, unknown>) => void; prompt: () => void } } } }).google;
    if (!googleClient?.accounts?.id) {
      await this.showToast('Google sign in could not be loaded. Please try again later.');
      return;
    }

    googleClient.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: async (response: { credential?: string }) => {
        if (!response.credential) {
          return;
        }
        try {
          await this.auth.googleLogin(response.credential).toPromise();
          this.showToast('Google login successful');
          await this.router.navigateByUrl('/tabs/map');
        } catch (error) {
          const responseError = (error as { error?: { error?: string } | string; message?: string }).error;
          const message = typeof responseError === 'string'
            ? responseError
            : responseError?.error ?? (error as { message?: string }).message ?? 'Google login failed';
          await this.showToast(message);
        }
      },
    });
    googleClient.accounts.id.prompt();
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2200, position: 'bottom' });
    await toast.present();
  }
}
