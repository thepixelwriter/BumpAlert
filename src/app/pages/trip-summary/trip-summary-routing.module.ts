import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TripSummaryPage } from './trip-summary.page';

const routes: Routes = [
  {
    path: '',
    component: TripSummaryPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TripSummaryPageRoutingModule {}
