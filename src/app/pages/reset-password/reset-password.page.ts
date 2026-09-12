import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.page.html',
  styleUrls: ['./reset-password.page.scss'],
  standalone: false,
})
export class ResetPasswordPage {
  resetForm: FormGroup;
  token = '';
  isSubmitting = false;
  submitError = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly auth: AuthService,
    private readonly toastCtrl: ToastController,
    private readonly router: Router,
  ) {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.resetForm = this.fb.group({
      token: [this.token, [Validators.required, Validators.minLength(10)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    });
  }

  async submit(): Promise<void> {
    this.submitError = '';
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      this.submitError = 'Please enter a valid reset token and password.';
      return;
    }

    const { token, password, confirmPassword } = this.resetForm.value;
    if (password !== confirmPassword) {
      this.resetForm.get('confirmPassword')?.setErrors({ mismatch: true });
      this.submitError = 'Passwords do not match.';
      return;
    }

    this.isSubmitting = true;
    try {
      await this.auth.resetPassword(token, password).toPromise();
      await this.showToast('Password updated. You can sign in now.');
      await this.router.navigateByUrl('/auth');
    } catch (error) {
      const responseError = (error as { error?: { error?: string } | string }).error;
      this.submitError = typeof responseError === 'string' ? responseError : responseError?.error ?? 'Password reset failed';
    } finally {
      this.isSubmitting = false;
    }
  }

  hasError(controlName: string, error: string): boolean {
    const control = this.resetForm.get(controlName);
    return !!control && control.touched && control.hasError(error);
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2600, position: 'bottom' });
    await toast.present();
  }
}