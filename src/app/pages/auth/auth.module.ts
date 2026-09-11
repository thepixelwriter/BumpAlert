import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AuthPage } from './auth.page';
import { AuthPageRoutingModule } from './auth-routing.module';

@NgModule({
  imports: [CommonModule, ReactiveFormsModule, IonicModule, AuthPageRoutingModule],
  declarations: [AuthPage],
})
export class AuthPageModule {}
