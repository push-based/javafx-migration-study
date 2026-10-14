import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { WeatherService } from '@web/weather-data-access';
import { map, tap } from 'rxjs';
import { WeatherStore } from '../weather-store';

/**
 * Stream view — the Angular replacement for the JavaFX `PrimaryController` /
 * `primary.fxml`. Spec requirements R6–R9, R11, R15.
 *
 * Public surface (what the tests target):
 *  - injects `WeatherService` (the SSE source) and `WeatherStore` (R9 carrier);
 *  - exposes a `forecast` signal — the latest forecast string, or null before
 *    the first event (R6 empty initial; R7 live update).
 *
 * The template renders the static "My Weather Forecast" heading, an
 * `aria-live="polite"` forecast region bound to `forecast()`, and a control to
 * navigate to the snapshot view (R11).
 *
 * `forecast` is `toSignal(forecast$().pipe(tap(write store), takeUntilDestroyed()))`:
 * the `toSignal` subscribes on construction (R8 subscribe-on-init), each event
 * updates the live region (R7) and is mirrored into `store.lastForecast` (R9),
 * and `takeUntilDestroyed()` tears the subscription down on destroy — running
 * the service teardown that closes the `EventSource` (R8/R3). Re-mounting opens
 * a fresh subscription (R12).
 */
@Component({
  selector: 'lib-weather-feature',
  imports: [RouterLink],
  templateUrl: './weather-feature.html',
  styleUrl: './weather-feature.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherFeature {
  protected readonly weatherService = inject(WeatherService);
  protected readonly store = inject(WeatherStore);

  /**
   * Latest forecast, or null until the first SSE event (R6/R7).
   *
   * Subscribing happens on construction via `toSignal` (R8 subscribe-on-init);
   * `takeUntilDestroyed()` unsubscribes when the component is destroyed, which
   * runs the service teardown and closes the `EventSource` (R8/R3). Re-mounting
   * the component re-runs this, so navigating back opens a fresh subscription
   * (R12). Each event is written into the cross-view carrier (R9) before it
   * surfaces as the latest forecast string.
   */
  readonly forecast: Signal<string | null> = toSignal(
    this.weatherService.forecast$().pipe(
      tap((weather) => this.store.lastForecast.set(weather.forecast)),
      map((weather) => weather.forecast),
      takeUntilDestroyed(),
    ),
    { initialValue: null },
  );
}
