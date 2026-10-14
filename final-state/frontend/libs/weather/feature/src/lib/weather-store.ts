import { Injectable, signal, WritableSignal } from '@angular/core';

/**
 * Cross-view carrier for the last forecast value (spec R9, option (a) in
 * `docs/specs/weather.md` §8). The JavaFX app used a shared singleton `Weather`
 * Spring bean autowired into both controllers; the Angular analogue is a small
 * `providedIn: 'root'` signal service:
 *
 *  - the stream view WRITES the latest forecast into `lastForecast` on each
 *    event, and
 *  - the snapshot view READS `lastForecast` to show the frozen value —
 *    without ever injecting `WeatherService` or opening an `EventSource` (R10).
 *
 * Initial value is empty (null) — the snapshot has nothing to show until the
 * stream has produced at least one value.
 */
@Injectable({ providedIn: 'root' })
export class WeatherStore {
  readonly lastForecast: WritableSignal<string | null> = signal<string | null>(
    null,
  );
}
