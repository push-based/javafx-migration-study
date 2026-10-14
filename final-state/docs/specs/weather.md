# Spec: Weather migration (`WeatherJFXClient` → `frontend/libs/weather/*`)

Requirements-first, test-first spec for migrating the JavaFX SSE client to Angular against the
**unchanged** Spring Boot SSE seam. The original JavaFX module **is** the requirements source; this
spec records what it does and how that behavior maps onto Angular — it does not invent new behavior.

Tags: `[decided]` (fixed by the design or verified from code), `[proposed]` (a recommendation),
`[open]` (left for the implementation to settle). Section 8 records the outcome of each `[open]` item.

---

## 1. Target & source

| | |
|---|---|
| **Source (JavaFX)** | `WeatherJFXClient` — `WeatherClientApplication`, `PrimaryController`, `SecondaryController`, `service/WeatherClient`, `domain/Weather`, `resources/.../primary.fxml`, `.../secondary.fxml` |
| **Becomes** | `frontend/libs/weather/data-access` (`@web/weather-data-access`) + `frontend/libs/weather/feature` (`@web/weather-feature`) |
| **Seam (frozen)** | `GET /weather/forecast`, `text/event-stream`, on `backend/weather-service`, port 8080 |
| **App route** | lazy `/weather` in `frontend/apps/web` (already wired; also the default redirect target) |
| **Scope** | `[decided]` smallest surface — read-only SSE, two views, one navigation. The migration POC for endpoint + dev proxy + SSE-as-Observable + `API_BASE_URL` token + lazy route. |

Starting point: the `web` shell exists, `API_BASE_URL` is provided from `environment.ts` (dev value
`''`), `provideHttpClient(withFetch())` is added, `/weather` lazy-loads `@web/weather-feature`, and
`proxy.conf.json` forwards `/weather` → `:8080`. The weather libs are scaffolded with **placeholder
components** (`WeatherDataAccess`, `WeatherFeature`) that the implementation replaces. (The
implementation later narrowed the proxy rule to `/weather/forecast`, because `/weather` also matched
the app's own `/weather` and `/weather/latest` routes and broke deep links.)

---

## 2. Requirements (the centerpiece)

Numbered, concrete, testable statements of behavior the original guarantees, grouped by area. Each is
the source for exactly one acceptance criterion in §6. Evidence cites the JavaFX source.

### data-access — the SSE client (`weather/data-access`)

- **R1 — Open the stream.** A `WeatherService.forecast$()` (or equivalent) opens a Server-Sent-Events
  connection to `{API_BASE_URL}/weather/forecast` and returns an `Observable<Weather>` that emits one
  `Weather` per server event. *(Replaces `WeatherClient.getWeatherForecast()` returning
  `Flux<Weather>` from `WebClient.get().uri("/weather/forecast").retrieve().bodyToFlux(Weather.class)`
  — `WeatherClient.java:17-22`.)*

- **R2 — Parse each event as `{ forecast: string }`.** Each emission carries a `Weather` with a
  `forecast` string parsed from the event's JSON `data` payload. The wrapper listens on the browser's
  **default `message` event** (`EventSource.onmessage`), because the server emits a bare `Flux<Weather>`
  with **no `ServerSentEvent` wrapper** — so events arrive unnamed; an `addEventListener('weather', …)`
  or any named-event listener would silently receive nothing. *(Seam: `WeatherController.java:17-19`
  returns `Flux<Weather>`, not `Flux<ServerSentEvent<Weather>>`; payload shape `domain/Weather.java`.)*

- **R3 — Teardown closes the connection (the critical non-visual requirement).** When the
  `Observable` returned by R1 is unsubscribed, the underlying browser `EventSource` is **closed**
  (`es.close()` in the teardown). No further events are delivered and the network connection is
  released. *(This is the 1:1 equivalent of `subscription.dispose()` — `PrimaryController.java:64`,
  commented `//close the connection`. It is the single most important behavior to preserve: without
  it the SSE connection leaks on navigate-away.)*

- **R4 — Surface stream errors on the Observable error channel.** A connection/stream error
  (`EventSource.onerror`) is forwarded to the `Observable`'s `error` callback rather than swallowed.
  *(The original logs `Throwable` in the error `Consumer` — `PrimaryController.java:52-56`. Web port
  routes the error to the subscriber; UI presentation of the error is `[open]`, see §8.)*

- **R5 — Base URL from the token, never hardcoded.** The endpoint URL is built from the injected
  `API_BASE_URL` token (`@web/shared-util`); the string `localhost:8080` (or any host) appears
  nowhere in the lib. *(Directly removes the hardcoded `webClientBuilder.baseUrl("http://localhost:8080")`
  — `WeatherClient.java:13-14`. Required by the workspace conventions.)*

### stream view (`weather/feature` — the "primary" view)

- **R6 — Initial render.** The stream view shows the heading **"My Weather Forecast"** and a forecast
  display region that is **empty until the first SSE event arrives** (no placeholder forecast text).
  *(`primary.fxml:13` static heading label; `primary.fxml:25` `weatherLabel` has no initial text and
  is populated only in the `subscribe` callback — `PrimaryController.java:44-51`.)*

- **R7 — Live update on every event.** The forecast region updates to the latest `forecast` string on
  **every** SSE event (~1.5s cadence), via `async` pipe or `toSignal`, with `OnPush` change
  detection. *(`PrimaryController.java:48-50` sets `weatherLabel` text inside `Platform.runLater` on
  each event; server emits every 1500 ms — `ReactiveWeatherRepository.java:16`. The Angular `async`
  pipe / signal replaces the manual `Platform.runLater` marshalling per the concept map.)*

- **R8 — Teardown on navigate-away.** Leaving the stream view (navigating to the snapshot view, or
  destroying the component) **unsubscribes** from the stream, triggering R3 (the `EventSource`
  closes). Realized with `takeUntilDestroyed` or the `async` pipe's automatic unsubscribe.
  *(`switchToSecondary` calls `subscription.dispose()` before navigating — `PrimaryController.java:64`.)*

- **R9 — Carry the latest value forward.** On navigating stream → snapshot, the **last forecast value
  shown** is carried over to the snapshot view (the frozen value the snapshot displays). *(The
  original copies `weatherLabel.getText()` into the shared `Weather` bean before disposing —
  `PrimaryController.java:63`. The Angular carrier mechanism is `[open]`, see §8.)*

### snapshot view (`weather/feature` — the "secondary" view)

- **R10 — Frozen snapshot, no stream.** The snapshot view shows the static title **"Latest
  Forecast:"** and the **frozen** forecast value carried from the stream view (R9). It **opens NO SSE
  connection** and does not update over time. *(`SecondaryController.java:37-38` sets `titleLabel` to
  "Latest Forecast:" and `weatherLabel` from the shared bean once in `initialize`; the secondary
  controller injects no `WeatherClient` and never subscribes.)*

- **R11 — Two-way navigation.** The stream view offers a control to go to the snapshot view, and the
  snapshot view offers a control to return to the stream view. *(`primary.fxml:21-22` "Get Current
  Forecast" → `switchToSecondary`; `secondary.fxml:22-23` "Back to Forecast" → `switchToPrimary`.)*

- **R12 — Returning re-subscribes fresh.** Navigating snapshot → stream opens a **new** SSE
  connection and resumes live updates (a fresh subscription, not a resumed one). *(`switchToPrimary`
  reloads `primary.fxml` — `SecondaryController.java:44-45` — which re-runs `PrimaryController.initialize`
  and re-subscribes — `PrimaryController.java:44`.)*

### cross-cutting

- **R13 — Lazy-loaded, deep-linkable route.** The feature is reachable at `/weather`, lazy-loaded, and
  directly addressable by URL (deep-linkable). *(Wired in `frontend/apps/web/src/app/app.routes.ts`;
  replaces the static `setRoot(Parent)` scene-swap navigation. In-app stream↔snapshot navigation uses
  the Angular Router.)*

- **R14 — Brand tokens, not the FXML colors.** The UI uses the brand palette tokens (e.g. page bg `--surface-page`, heading `--color-ink`/
  `--color-primary`, body `--color-text`). The FXML `lightskyblue` (`primary.fxml:9`) and `moccasin`
  (`secondary.fxml:9`) backgrounds were **placeholder demo colors, not brand**, and are **not**
  carried over. *(Plain HTML/CSS with brand tokens, no Material.)*

- **R15 — Accessible live region.** The live forecast region in the stream view is an
  `aria-live="polite"` live region so screen readers announce each update without stealing focus;
  the feature is AXE-clean / WCAG AA. *(New requirement for the web port — no FXML equivalent;
  required by the workspace's WCAG AA rule.)*

---

## 3. Angular shape

`[decided]` library split (aliases verified against the scaffold's `tsconfig.base.json`):

- **`weather/data-access`** — alias `@web/weather-data-access`. **Delete the generated placeholder
  *component*** (`WeatherDataAccess` + its `.html`) — a `data-access` lib is a service layer, not a
  component. Add:
  - `Weather` model — interface/type `{ forecast: string }`.
  - `WeatherService` (`@Injectable({ providedIn: 'root' })`) exposing `forecast$(): Observable<Weather>`,
    built as `new Observable(subscriber => { const es = new EventSource(url); es.onmessage = e =>
    subscriber.next(JSON.parse(e.data)); es.onerror = err => subscriber.error(err); return () =>
    es.close(); })`, with `url` from `inject(API_BASE_URL) + '/weather/forecast'`.

- **`weather/feature`** — alias `@web/weather-feature`. Repurpose the generated `WeatherFeature`
  component as the **stream view**; add a **snapshot** component. Both standalone (no `standalone: true`
  on v20+), `OnPush`, `inject()`.
  - **Stream view** — injects `WeatherService`; exposes the forecast via
    `toSignal(forecast$().pipe(takeUntilDestroyed()))` **or** consumes `forecast$() | async` in the
    template (R7/R8 satisfied either way — choice is an implementation detail, not a `[open]`).
  - **Snapshot view** — injects **no** `WeatherService` (enforces R10); reads the carried value (§8).
  - **Routes** (`lib.routes.ts`, generated as `''` → placeholder): `''` → stream view, a child path
    (proposed `latest`) → snapshot view. `[proposed]` snapshot path name `latest`.

State model: signals + `computed()`; the live forecast is a signal (via `toSignal`) or the `async`
pipe — no manual subscription bookkeeping beyond `takeUntilDestroyed`.

---

## 4. Seam mapping

API contract is **FROZEN** — verified from `backend/weather-service` source (re-confirmed for this
spec). No endpoint or model change.

| Property | Value | Evidence (backend) |
|---|---|---|
| Endpoint | `GET /weather/forecast` | `WeatherController.java:17` |
| Media type | `text/event-stream` | `WeatherController.java:18` (`MediaType.TEXT_EVENT_STREAM_VALUE`) |
| Cadence | **1500 ms** per event | `repository/ReactiveWeatherRepository.java:16` (`Flux.interval(Duration.ofMillis(1500))`) |
| Payload (JSON) | `{ "forecast": string }` | `domain/Weather.java` |
| Payload values | one of **5 fixed strings**, random | `domain/Forecaster.java:5-11` |
| SSE event name | **default `message`** (no `ServerSentEvent` wrapper) | `WeatherController.java:19` returns `Flux<Weather>` — confirmed no `ServerSentEvent` usage anywhere in `backend/weather-service/src` |
| CORS | **none** configured | no `@CrossOrigin`/`CorsWebFilter`/`WebFluxConfigurer` in `backend/weather-service/src`; empty `application.properties` |

Seam → Angular mapping:

- `Flux<Weather>` over `text/event-stream` → browser `EventSource` wrapped as RxJS `Observable<Weather>`
  (R1). **Listen on `onmessage`** (R2) — the framing gotcha above.
- `subscription.dispose()` → `EventSource.close()` in the Observable teardown (R3) + `takeUntilDestroyed`
  / `async`-pipe unsubscribe on navigate-away (R8).
- `WebClient.baseUrl("http://localhost:8080")` → `API_BASE_URL` token + path (R5).
- **CORS:** dev is handled by the existing `proxy.conf.json` (`/weather` → `:8080`), so no backend
  change for local dev. **Deployed CORS on the Spring server is out of scope here** and surfaced as
  `[open]` (§8) — do not alter the seam to work around it.

> Constraint check: nothing in this spec requires an endpoint or data-model change. If implementation
> appears to need one, STOP and raise it — do not modify the seam.

---

## 5. UI / brand

Plain HTML/CSS with brand tokens. `[proposed]` mapping:

| Element | Token |
|---|---|
| Page background | `--surface-page` (`#FCFCFD`) |
| Heading "My Weather Forecast" / "Latest Forecast:" | `--color-ink` (`#121926`), or section accent `--color-primary` (`#6938EF`) |
| Forecast text (body) | `--color-text` (`#364152`) |
| Navigation button(s) | `--color-primary` (`#6938EF`) for primary action |
| Card/panel around the forecast (if used) | `--surface-1` / `--surface-2`, optional tint `--surface-purple` |

Layout: the FXML used centered vertical stacks (`VBox alignment=CENTER`) — heading, button, forecast
label. A centered single-column layout is a reasonable web analogue but is **not a hard requirement**;
only the brand tokens (R14) and the live region (R15) are. The FXML `lightskyblue`/`moccasin` are
**dropped** (placeholder, not brand — R14).

Accessibility: forecast region `aria-live="polite"` (R15); verify WCAG AA contrast for `--color-primary`
on `--surface-page` before shipping; AXE-clean.

---

## 6. Acceptance criteria (one per requirement)

Each phrased to become a unit (`u`) or e2e (`e`) test in the test step. Note for the tests:
**jsdom has no `EventSource`**, so the data-access suite needs a fake `EventSource` (mandatory, not
optional) to drive R1–R4.

- **AC1 (R1, u)** — subscribing to `forecast$()` constructs an `EventSource` whose URL ends with
  `/weather/forecast`; dispatching a fake `message` causes the Observable to emit one `Weather`.
- **AC2 (R2, u)** — a fake `message` event with `data = '{"forecast":"Foggy and cold. Time for an
  espresso."}'` yields `{ forecast: 'Foggy and cold. Time for an espresso.' }`; a listener bound to a
  **named** event (e.g. `'weather'`) receives nothing (asserts `onmessage`, not named).
- **AC3 (R3, u)** — after `unsubscribe()`, the fake `EventSource`'s `close()` was called exactly once
  and subsequent dispatched events do **not** emit. *(The critical test.)*
- **AC4 (R4, u)** — dispatching the fake `EventSource`'s `error` invokes the Observable's `error`
  callback (not `next`/`complete`).
- **AC5 (R5, u)** — with `API_BASE_URL` provided as `'http://example.test'`, the constructed
  `EventSource` URL is `http://example.test/weather/forecast`; a static scan/test asserts no
  hardcoded `localhost`/`:8080` literal in the lib source.
- **AC6 (R6, u)** — on first render of the stream view, the heading reads "My Weather Forecast" and
  the forecast region is empty (no forecast text) before any event.
- **AC7 (R7, u)** — pushing two successive forecasts through a mocked service `Subject` updates the
  forecast region to the second value (live update); `OnPush` component reflects it.
- **AC8 (R8, u)** — destroying the stream component (or navigating away) unsubscribes from the service
  Observable (e.g. the mock's teardown / `EventSource.close` is invoked).
- **AC9 (R9, u/e)** — after at least one forecast is shown, navigating stream → snapshot results in
  the snapshot view displaying that exact last value.
- **AC10 (R10, u)** — the snapshot component injects no `WeatherService` and constructs **no**
  `EventSource`; it renders "Latest Forecast:" + the carried value and never changes it over time.
- **AC11 (R11, e)** — the stream view exposes a control that navigates to the snapshot view, and the
  snapshot view exposes a control that navigates back to the stream view.
- **AC12 (R12, u/e)** — navigating snapshot → stream constructs a **new** `EventSource` (fresh
  subscription) and live updates resume.
- **AC13 (R13, e)** — loading `/weather` directly (deep link) renders the stream view; the route is
  lazy-loaded (its chunk loads on navigation, not in the initial bundle).
- **AC14 (R14, u)** — no `lightskyblue`/`moccasin` (or other non-brand color) literals appear in the
  feature styles; brand tokens/variables are used for background, heading, and body.
- **AC15 (R15, e)** — the forecast region carries `aria-live="polite"`; an AXE scan of the stream and
  snapshot views reports no violations.

Coverage check: the §2 requirements list is testable and **every** requirement has a paired
acceptance criterion above (R1↔AC1 … R15↔AC15).

---

## 7. Out of scope / non-goals

- No change to the Spring `backend/weather-service` logic or the SSE contract.
- No deployed CORS work in this migration (dev proxy suffices) — see §8.

---

## 8. Open decisions and their outcomes

These items were left open when the spec was written. Each one ends with the outcome that shipped.

- **`[open]` — Cross-view "last value" carrier (R9).** The JavaFX app uses a shared `Weather` singleton
  Spring bean (`SpringConfig.getWeather()` in `WeatherClientApplication.java:64-69`, `@Autowired` into
  both controllers) as the cross-view carrier. There is **no 1:1 Angular idiom**. Candidates:
  - **(a) `[proposed]` a small `providedIn: 'root'` signal service** holding the latest forecast — the
    stream view writes it, the snapshot view reads it. Testable, survives in-session navigation,
    mirrors the singleton-bean semantics most closely, and keeps the snapshot view free of the SSE
    service (R10).
  - **(b)** Angular Router state / resolver passing the value as navigation `state`. Simpler but the
    value is lost on a hard refresh of the snapshot URL (deep-link to `latest` would have nothing to
    show) — a behavioral difference from (a).

  **Outcome:** option (a), shipped as `WeatherStore` in `weather/feature`.

- **`[open]` — Stream-error UI surfacing (R4).** R4 fixes that errors reach the Observable error
  channel. How the UI presents a stream error (silent + console like the original's logger; inline
  message; a retry control) is unspecified by the original (it only logged).

  **Outcome:** no error message in the UI and no auto-retry. A stream error stops the live updates,
  and Angular's error handler logs it to the console. This matches the original, which only logged it.

- **`[open]` — Snapshot route path name.** `latest` was `[proposed]`. The alternatives were `snapshot`
  or a non-routed in-component view toggle, which is closer to the single-`Scene` original but weakens
  R11/R13's deep-linkability.

  **Outcome:** `latest`, so the snapshot view lives at `/weather/latest`.

- **`[open]` — Deployed CORS.** Local dev uses the existing `proxy.conf.json`; a deployed build pointing
  at a different origin needs real CORS on `backend/weather-service`. **Do not** alter the seam to work
  around it.

  **Outcome:** still open. The migration ran against the dev proxy only; CORS waits for a hosting
  decision.

---

## 9. Inputs verified for this spec

JavaFX source (requirements): `WeatherClientApplication.java`, `PrimaryController.java`,
`SecondaryController.java`, `service/WeatherClient.java`, `domain/Weather.java`, `primary.fxml`,
`secondary.fxml`. Seam (re-confirmed from code): `backend/weather-service/.../WeatherController.java`,
`.../repository/ReactiveWeatherRepository.java`, `.../domain/Weather.java`, `.../domain/Forecaster.java`,
`.../repository/WeatherRepository.java` (no CORS, no `ServerSentEvent` wrapper). Starting scaffold:
`frontend/libs/shared/util/src/lib/api-base-url.token.ts`, `frontend/apps/web/src/environments/environment.ts`,
`.../src/app/app.config.ts`, `.../src/app/app.routes.ts`, `.../proxy.conf.json`, the placeholder
`weather/{data-access,feature}` components, and `tsconfig.base.json` aliases
(`@web/weather-data-access`, `@web/weather-feature`, `@web/shared-util`).
