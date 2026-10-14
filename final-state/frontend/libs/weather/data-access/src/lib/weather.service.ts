import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '@web/shared-util';
import { Observable } from 'rxjs';
import { Weather } from './weather.model';

/**
 * SSE client for the weather forecast stream — the Angular replacement for the
 * JavaFX `WeatherClient` (`WebClient.get().uri("/weather/forecast")
 * .retrieve().bodyToFlux(Weather.class)`).
 *
 * Contract (encoded by `weather.service.spec.ts`):
 *  - `forecast$()` opens an `EventSource` at `{API_BASE_URL}/weather/forecast`
 *    and returns an `Observable<Weather>` emitting one `Weather` per event (R1).
 *  - Listens on the default `message` event — the server sends no
 *    `ServerSentEvent` wrapper, so events arrive unnamed (R2).
 *  - On unsubscribe, the `EventSource` is closed in the teardown (R3, critical).
 *  - `EventSource` errors are forwarded to the Observable error channel (R4).
 *  - The base URL comes from the injected `API_BASE_URL` token, never hardcoded
 *    (R5) — no backend host literal appears anywhere in this lib.
 */
@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly baseUrl = inject(API_BASE_URL);

  forecast$(): Observable<Weather> {
    return new Observable<Weather>((subscriber) => {
      const source = new EventSource(`${this.baseUrl}/weather/forecast`);

      // Default `message` event only — the server emits a bare Flux<Weather>
      // with no ServerSentEvent wrapper, so events arrive unnamed (R2).
      source.onmessage = (event: MessageEvent) => {
        subscriber.next(JSON.parse(event.data) as Weather);
      };

      // Forward stream/connection errors to the Observable error channel (R4).
      source.onerror = (event: Event) => {
        subscriber.error(event);
      };

      // Teardown closes the connection on unsubscribe (R3, the critical one):
      // the 1:1 equivalent of the JavaFX `subscription.dispose()`.
      return () => source.close();
    });
  }
}
