import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { DetectionPageRoutingModule } from './detection-routing.module';
import { DetectionPage } from './detection.page';

@NgModule({
  imports: [IonicModule, CommonModule, FormsModule, DetectionPageRoutingModule],
  declarations: [DetectionPage],
})
export class DetectionPageModule {}
