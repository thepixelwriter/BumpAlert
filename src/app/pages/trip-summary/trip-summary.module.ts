import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TripSummaryPageRoutingModule } from './trip-summary-routing.module';
import { TripSummaryPage } from './trip-summary.page';

@NgModule({
  imports: [IonicModule, CommonModule, FormsModule, TripSummaryPageRoutingModule],
  declarations: [TripSummaryPage],
})
export class TripSummaryPageModule {}
