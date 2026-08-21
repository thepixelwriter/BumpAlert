import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'detection',
    pathMatch: 'full',
  },
  {
    path: 'detection',
    loadChildren: () => import('./pages/detection/detection.module').then((m) => m.DetectionPageModule),
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./pages/dashboard/dashboard.module').then((m) => m.DashboardPageModule),
  },
  {
    path: 'trip-summary',
    loadChildren: () => import('./pages/trip-summary/trip-summary.module').then((m) => m.TripSummaryPageModule),
  },
];
@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
