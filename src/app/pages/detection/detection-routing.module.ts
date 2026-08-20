import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DetectionPage } from './detection.page';

const routes: Routes = [
  {
    path: '',
    component: DetectionPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DetectionPageRoutingModule {}
