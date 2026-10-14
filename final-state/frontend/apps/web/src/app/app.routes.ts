import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'weather' },
  {
    path: 'weather',
    loadChildren: () =>
      import('@web/weather-feature').then((m) => m.weatherFeatureRoutes),
  },
  {
    path: 'music',
    loadChildren: () =>
      import('@web/music-feature').then((m) => m.musicFeatureRoutes),
  },
];
