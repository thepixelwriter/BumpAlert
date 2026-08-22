import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      // Telemetry is intentionally the primary, default app experience.
      {
        path: 'telemetry',
        loadChildren: () => import('../pages/review/review.module').then((m) => m.ReviewPageModule),
      },
      // Legacy deep link.
      {
        path: 'review',
        redirectTo: '/tabs/telemetry',
        pathMatch: 'full',
      },
      // Tab 3: Settings
      {
        path: 'settings',
        loadChildren: () => import('../pages/settings/settings.module').then((m) => m.SettingsPageModule),
      },
      // Backward-compatible aliases
      {
        path: 'dashboard',
        redirectTo: '/tabs/telemetry',
        pathMatch: 'full',
      },
      {
        path: 'detection',
        redirectTo: '/tabs/telemetry',
        pathMatch: 'full',
      },
      {
        path: 'trip-summary',
        redirectTo: '/tabs/telemetry',
        pathMatch: 'full',
      },
      {
        path: '',
        redirectTo: '/tabs/telemetry',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/telemetry',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule {}
