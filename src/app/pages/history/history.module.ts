import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { HistoryPage } from './history.page';
import { HistoryPageRoutingModule } from './history-routing.module';

@NgModule({
  imports: [CommonModule, IonicModule, HistoryPageRoutingModule],
  declarations: [HistoryPage],
})
export class HistoryPageModule {}
