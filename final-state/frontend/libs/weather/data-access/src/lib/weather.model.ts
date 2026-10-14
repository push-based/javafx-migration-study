/**
 * The single payload shape carried over the SSE seam.
 *
 * Frozen seam (do not change): the server emits a bare `Flux<Weather>` over
 * `text/event-stream` at `GET /weather/forecast`, each event's JSON `data`
 * being `{ "forecast": string }` (see `backend/weather-service` domain/Weather).
 */
export interface Weather {
  forecast: string;
}
