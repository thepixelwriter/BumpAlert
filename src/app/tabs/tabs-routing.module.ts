import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      // Tab 1: Map (default)
      {
        path: 'map',
        loadChildren: () => import('../pages/map/map.module').then((m) => m.MapPageModule),
      },
      // Tab 2: Telemetry Review
      {
        path: 'review',
        loadChildren: () => import('../pages/review/review.module').then((m) => m.ReviewPageModule),
      },
      // Tab 3: Settings
      {
        path: 'settings',
        loadChildren: () => import('../pages/settings/settings.module').then((m) => m.SettingsPageModule),
      },
      // Backward-compatible aliases
      {
        path: 'dashboard',
        redirectTo: '/tabs/map',
        pathMatch: 'full',
      },
      {
        path: 'detection',
        redirectTo: '/tabs/map',
        pathMatch: 'full',
      },
      {
        path: 'trip-summary',
        redirectTo: '/tabs/review',
        pathMatch: 'full',
      },
      {
        path: '',
        redirectTo: '/tabs/map',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/map',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule {}
