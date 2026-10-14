import { Route } from '@angular/router';
import { WeatherFeature } from './weather-feature/weather-feature';
import { WeatherSnapshot } from './weather-snapshot/weather-snapshot';

/**
 * Weather feature routes (spec R11/R13). `''` → stream view (the default),
 * `latest` → frozen snapshot view. Two-way nav between them uses the Router.
 * Path name `latest`: see `docs/specs/weather.md` §8.
 */
export const weatherFeatureRoutes: Route[] = [
  { path: '', component: WeatherFeature },
  { path: 'latest', component: WeatherSnapshot },
];
