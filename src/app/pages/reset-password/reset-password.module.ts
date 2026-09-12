import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ResetPasswordPage } from './reset-password.page';
import { ResetPasswordPageRoutingModule } from './reset-password-routing.module';

@NgModule({
  imports: [CommonModule, ReactiveFormsModule, IonicModule, ResetPasswordPageRoutingModule],
  declarations: [ResetPasswordPage],
})
export class ResetPasswordPageModule {}