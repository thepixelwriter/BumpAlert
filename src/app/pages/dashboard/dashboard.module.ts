import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { DashboardPageRoutingModule } from './dashboard-routing.module';
import { DashboardPage } from './dashboard.page';

@NgModule({
  imports: [IonicModule, CommonModule, FormsModule, DashboardPageRoutingModule],
  declarations: [DashboardPage],
})
export class DashboardPageModule {}
