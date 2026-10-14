import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { WeatherStore } from '../weather-store';

/**
 * Snapshot view — the Angular replacement for the JavaFX `SecondaryController` /
 * `secondary.fxml`. Spec requirements R10, R11.
 *
 * Frozen snapshot: shows the static title "Latest Forecast:" and the frozen
 * forecast value carried from the stream view (R9 via `WeatherStore`). It opens
 * NO SSE connection and injects NO `WeatherService` — that's the whole point of
 * R10, and it's enforced structurally: this class simply has no `WeatherService`
 * dependency.
 *
 * `forecast` is wired straight to `store.lastForecast` — the carried value, with
 * no `WeatherService` dependency and no `EventSource`, so the snapshot is frozen
 * (AC10) and the guardrail assertions (no service, no EventSource) hold.
 */
@Component({
  selector: 'lib-weather-snapshot',
  imports: [RouterLink],
  templateUrl: './weather-snapshot.html',
  styleUrl: './weather-snapshot.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherSnapshot {
  protected readonly store = inject(WeatherStore);

  /**
   * Frozen forecast carried from the stream view (R9/R10): the value the store
   * already holds. No `WeatherService`, no `EventSource`, no live updates — it
   * only ever changes if the stream view runs again and writes the store.
   */
  readonly forecast: Signal<string | null> = this.store.lastForecast;
}
