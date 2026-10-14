# Spec: Music CRUD migration (`SpringBootWebClientFX` + `SpringBootClientFXMultiThread` → `frontend/libs/music/*`)

Requirements-first, test-first spec for collapsing the **two** JavaFX Music clients into **one**
Angular CRUD feature against the **unchanged** Spring Boot REST seam. The original JavaFX modules
**are** the requirements source; this spec records what they do and how that behavior maps onto
Angular — it does not invent new behavior.

Tags: `[decided]` (fixed by the design or verified from code), `[proposed]` (a recommendation),
`[open]` (left for the implementation to settle). Section 8 records the outcome of each `[open]` item.

Companion spec: [`weather.md`](weather.md), the first migration, which proved the shared app shell.

---

## 1. Target & source — the collapse

| | |
|---|---|
| **Source A (JavaFX, blocking)** | `SpringBootWebClientFX` — `MusicClientApp`, `MusicFXApp`, `ViewController`, `service/MusicRESTService`, `domain/MusicCategory`, `resources/.../view.fxml` |
| **Source B (JavaFX, `Task`+spinner)** | `SpringBootClientFXMultiThread` — the **same** files, plus a `ProgressIndicator` and `Task`/`Thread` threading in its `ViewController` |
| **Becomes** | **one** `frontend/libs/music/data-access` (`@web/music-data-access`) + `frontend/libs/music/feature` (`@web/music-feature`) |
| **Seam (frozen)** | `/musiccategories` CRUD on `backend/rest-h2` *or* `backend/rest-mysql`, port 8080 (§4) |
| **App route** | lazy `/music` in `frontend/apps/web` (already wired — verified in `app.routes.ts`) |
| **Scope** | `[decided]` full CRUD: table + reactive form + the exact button enable/disable rules + a `loading` spinner. The migration's CRUD/forms/state proof. |

### 1.1 The collapse — confirmed from a file-by-file diff `[decided]`

The two clients differ **only in threading**. Verified by `diff`:

- **`service/MusicRESTService.java`** — **byte-identical except whitespace** (`diff -w` → identical;
  the raw diff shows only indentation/spacing on 4 lines). Same five methods, same URIs, same
  `WebClient.block()` calls.
- **`domain/MusicCategory.java`** — identical except one line of **trailing whitespace**.
- **`view.fxml`** — identical **except** Source B adds one `<HBox>` containing
  `<ProgressIndicator fx:id="progressIndicator" visible="false"/>` (and the matching import +
  `text=""` on the result label). Same `TableView`, same two columns (`idColumn` 0.3 / `categoryNameColumn`
  0.7), same `categoryTextField`, same three buttons (`New`/`Update`/`Delete`).
- **`MusicClientApp.java`** — identical except the window **title string** ("…with REST" vs "…with
  REST MultiThread").
- **`MusicFXApp.java`** and **`application.properties`** — identical.
- **`ViewController.java`** — the **only** real divergence. Source B wraps each CRUD call in an inner
  `javafx.concurrent.Task` started on `new Thread(task).start()`, tracks an in-flight counter
  (`backgroundActive`) bound to the spinner (`progressIndicator.visible ⇔ backgroundActive > 0`,
  `ViewController.java:153-154`), and calls `Thread.sleep(2500)` (`SLEEPCOUNT`) inside each `Task` to
  make the spinner visible. The button enable/disable bindings, selection listener, and column
  factories are **identical** to Source A.

**⇒ Both collapse into one Angular client.** In the browser `HttpClient` is async by construction, so
the whole blocking-vs-`Task` contrast (the only reason two modules exist) **dissolves**. The
`ProgressIndicator` becomes
a **`loading` signal**; the artificial **2.5s `Thread.sleep` is dropped** (it existed solely to make a
desktop spinner perceptible). One behavioral nuance to preserve from Source B's success handlers: each
successful mutation **clears the text field** (`categoryTextField.setText("")` —
`ViewController.java:99,124` in B; A does this only for create) — folded into R10–R12 below.

Starting point: the `web` shell exists, `API_BASE_URL` is provided from `environment.ts` (dev value
`''`), `provideHttpClient(withFetch())` is added, `/music` lazy-loads `@web/music-feature` (verified in
`app.routes.ts`), and `proxy.conf.json` forwards `/musiccategories` → `:8080`. Unlike weather,
`/musiccategories` is a **distinct path** from the `/music` SPA route, so there is **no proxy
over-match concern**. The music libs are scaffolded with **placeholder components** (`MusicDataAccess`,
`MusicFeature`) that the implementation replaces.

---

## 2. Requirements (the centerpiece)

Numbered, concrete, testable statements of behavior the original guarantees, grouped by area. Each is
the source for exactly one acceptance criterion in §6. Evidence cites the JavaFX source (line numbers
from `SpringBootClientFXMultiThread` unless noted — it is the superset; the bindings it shares with
`SpringBootWebClientFX` are byte-identical).

### data-access — the REST client (`music/data-access`)

- **R1 — List.** `MusicCategoryService.list()` issues `GET {API_BASE_URL}/musiccategories` and returns
  the full array of `MusicCategory`. *(Replaces `MusicRESTService.getMusicCategories()` —
  `MusicRESTService.java:25-34`, `bodyToFlux(MusicCategory.class).collectList()`.)*

- **R2 — Create.** `create(name)` issues `POST {API_BASE_URL}/musiccategories` with body
  `{ musicCategory: name }` (**no id** — the server generates it) and `Content-Type: application/json`,
  and returns the saved entity (which carries the **server-generated id**). The server responds
  **`201 Created`**, not `200`. *(Replaces `createMusicCategory(String)` —
  `MusicRESTService.java:45-57`, builds a `MusicCategory` with only the name set; seam returns 201 —
  §4.)*

- **R3 — Update.** `update(category)` issues `PUT {API_BASE_URL}/musiccategories/{id}` with the full
  `MusicCategory` body and returns the updated entity. *(Replaces `updateMusicCategory(MusicCategory)`
  — `MusicRESTService.java:59-68`; the seam **forces the id from the path** and returns `404` if the
  id is absent — §4.)*

- **R4 — Delete.** `remove(id)` issues `DELETE {API_BASE_URL}/musiccategories/{id}` and completes with
  **no return value** (`void`/empty body). *(Replaces `deleteMusicCategory(MusicCategory)` —
  `MusicRESTService.java:70-77`, `bodyToMono(Void.class)`; seam returns `200` with an **empty body**
  and is a **silent no-op** for a missing id — §4.)*

- **R5 — Base URL from the token, never hardcoded.** Every request URL is built from the injected
  `API_BASE_URL` token (`@web/shared-util`); the string `localhost:8080` (or any host) appears
  **nowhere** in the lib. *(Directly removes `webClientBuilder.baseUrl("http://localhost:8080")` —
  `MusicRESTService.java:17-20`. Required by the workspace conventions.)*

### form & validation (`music/feature`) — the validation rules are the centrepiece

Lifted **verbatim** from `ViewController.initialize()` (`:144-152`, identical in both clients). These
three enable rules are the highest-value behavior to preserve exactly.

- **R6 — "New"/Create enabled ⇔ no row selected AND name field non-empty.** *(`createButton.disable`
  bound to `selectedItemProperty().isNotNull().or(textProperty().isEmpty())` —
  `ViewController.java:150-152`; create is for a **new** category, so an active selection disables it.)*

- **R7 — "Update" enabled ⇔ a row is selected AND the field was modified AND the field is non-empty.**
  *(`updateButton.disable` bound to `selectedItemProperty().isNull().or(modifiedProperty.not()).or(textProperty().isEmpty())`
  — `ViewController.java:146-149`.)*

- **R8 — "Delete" enabled ⇔ a row is selected** (no field condition at all). *(`removeButton.disable`
  bound to `selectedItemProperty().isNull()` — `ViewController.java:144-145`.)*

- **R9 — "modified" semantics.** A `modified` flag becomes **true on any edit of the name field**, and
  is **reset to false** (a) whenever a row is selected/re-selected and (b) **after a successful
  update**. *(Set true in `handleKeyAction` on `onKeyReleased` — `ViewController.java:137-139`,
  `view.fxml:59-60`; reset false in the selection listener — `ViewController.java:167`; reset false in
  the update success handler — `ViewController.java:126`.)*

- **R5b — Required field (validation).** The name field is **required**; an empty or whitespace-only
  value is treated as empty (whitespace must be trimmed so " " does not enable Create/Update).
  *(JavaFX uses `textProperty().isEmpty()` on the raw control — `:121,124`; the Angular port uses
  `Validators.required` plus a trim so whitespace-only does not satisfy R6/R7. The trim is the one
  deliberate hardening over the literal FX check — flagged, behavior-preserving.)*

### table & selection (`music/feature`)

- **R10 — On load, list the categories.** The view renders a table of all categories from R1's
  `GET /musiccategories` on init, with two columns **ID** and **Category**. *(`initialize` calls
  `getMusicCategories()` and sets the items — `ViewController.java:160-162`; columns `idColumn`/
  `categoryNameColumn` — `view.fxml:33-37`. Selection starts **cleared** — `:178`.)*

- **R11 — Select a row copies its name into the field; deselect clears it.** Selecting a table row
  copies that category's name into the name field (and records it as the selected category, `modified`
  → false). Selecting nothing (null) clears the field. *(Selection listener —
  `ViewController.java:163-175`: sets `categoryTextField` to the selected name, else `""`.)*

- **R12 — Create round-trip.** Creating: `create(name)` → on success **re-fetch the whole list** (R1),
  **clear the selection**, **clear the name field**, and set a status message
  `New category <name> created.` *(`createButtonAction` + `CreateTask.onSucceeded` —
  `ViewController.java:68-86,73-79`.)*

- **R13 — Update round-trip.** Updating: take the selected row, set its name to the field value, call
  `update(category)` → on success **re-fetch the whole list**, **clear the selection**, **clear the
  field**, reset `modified` → false, and set status `Category <name> updated.` *(`updateButtonAction` +
  `UpdateTask.onSucceeded` — `ViewController.java:112-134`.)*

- **R14 — Delete round-trip.** Deleting: `remove(selectedId)` → on success **re-fetch the whole list**,
  **clear the selection**, **clear the field**, and set status `Category <name> deleted.`
  *(`removeButtonAction` + `RemoveTask.onSucceeded` — `ViewController.java:89-109`.)*

- **R15 — Server is the source of truth.** The table after any mutation reflects the **re-fetched**
  list (R12–R14 each re-call R1), **not** an optimistic local edit. *(All three success handlers
  rebuild `musicCategoryData` from `getMusicCategories()` — `:74-75,95-96,120-121`; the list is never
  mutated in place.)*

### cross-cutting state

- **R16 — `loading` signal (spinner) ⇔ any request in flight.** A `loading` signal is true while any
  `list`/`create`/`update`/`delete` request is outstanding and false otherwise; a spinner shows iff
  `loading()`. **No artificial delay** — the original's `Thread.sleep(2500)` is **dropped**. *(Replaces
  `progressIndicator.visible ⇔ backgroundActive > 0` and the `SLEEPCOUNT` sleep —
  `ViewController.java:33,153-154,190,205,220`. Source A had no spinner; the lesson, not the threading,
  carries over.)*

- **R17 — Errors are surfaced and never leave `loading` stuck.** A failed request sets a visible error
  message and clears `loading` (the finalize path runs on both success and failure). *(Both `Task`
  failure handlers decrement `backgroundActive` and set an "Oops!" / error message —
  `ViewController.java:80-84,102-107,128-132`. The literal strings are desktop artifacts — see R18 and
  OD-3.)*

- **R18 — Error text reflects the real failure, not a hardcoded cause.** The delete-failure path does
  **not** assert a fixed "Foreign key constraint" cause; error text is driven by the actual HTTP
  failure. *(The original hardcodes `"...Foregin key constraint."` on **any** delete failure —
  `ViewController.java:104-106` — which is a desktop artifact: no FK rejection occurs with the seed
  data via this endpoint. Modernized per OD-3; the seam is **not** changed.)*

- **R19 — Empty list stays usable.** With zero categories, the view still renders (an empty table) and
  Create still works (R6 depends only on no-selection + non-empty field, both satisfiable with an empty
  list). *(No FX equivalent — the seed always has 8 rows; this guards the web port against an
  empty/after-delete-all state. New, behavior-preserving.)*

- **R20 — Lazy-loaded, deep-linkable route.** The feature is reachable at `/music`, lazy-loaded, and
  directly addressable by URL. *(Wired in `frontend/apps/web/src/app/app.routes.ts`, verified;
  replaces `setRoot`/single-`Scene` desktop navigation.)*

- **R21 — Brand tokens, not the FXML colors.** The UI uses the brand palette; the FXML `linear-gradient(aliceblue, lightblue)`
  background (`view.fxml:20-21`) and the `DropShadow` (`:40-41`) were **placeholder demo styling, not
  brand**, and are **not** carried over. **Delete** is the one legitimate `--color-accent` (Torch Red)
  destructive action. *(Plain HTML/CSS with brand tokens, no Material.)*

- **R22 — Accessible CRUD UI.** The table has proper semantics (header row, column headers), the name
  input has an associated `<label for>`, buttons have accessible names, and the status/error region is
  an `aria-live="polite"` live region; the feature is AXE-clean / WCAG AA. *(New requirement for the
  web port — partially implied by the FXML `Label "Category Name"` + result label, hardened to WCAG AA.)*

---

## 3. Angular shape

`[decided]` library split (aliases verified **flat** against the scaffold's `tsconfig.base.json`: `@web/music-data-access`, `@web/music-feature`,
`@web/shared-util`):

- **`music/data-access`** — alias `@web/music-data-access`. **Delete the generated placeholder
  *component*** (`MusicDataAccess` + its `.html`) — a `data-access` lib is a service layer, not a
  component (same move as weather). Add:
  - **Models** — `MusicCategory = { musicCategoryId: number; musicCategory: string }`, and a create
    payload type `NewMusicCategory = { musicCategory: string }` (POST sends **no id** — R2).
  - **`MusicCategoryService`** (`@Injectable({ providedIn: 'root' })`, `inject(HttpClient)` +
    `inject(API_BASE_URL)`):
    - `list(): Observable<MusicCategory[]>` → `GET {base}/musiccategories` (R1).
    - `create(name: string): Observable<MusicCategory>` → `POST {base}/musiccategories`, body
      `{ musicCategory: name }` (R2; `HttpClient` treats 201 as success — assert 201 in tests).
    - `update(category: MusicCategory): Observable<MusicCategory>` → `PUT {base}/musiccategories/{id}`
      (R3).
    - `remove(id: number): Observable<void>` → `DELETE {base}/musiccategories/{id}` (R4).
    - `getOne` — **omitted** by default (OD-2): the UI never calls it and the original path is buggy.

- **`music/feature`** — alias `@web/music-feature`. Fill the generated `MusicFeature` component (the
  placeholder routed at `''` in `lib.routes.ts`). Standalone (no `standalone: true` on v20+),
  `ChangeDetectionStrategy.OnPush`, `inject()`. State as **signals** + `computed()`:
  - **Signals:** `categories: MusicCategory[]`, `selected: MusicCategory | null`, `loading: boolean`,
    `message: string` (status), `error: string | null`.
  - **Reactive form:** `{ categoryName: ['', Validators.required] }` (R5b); a trim guards
    whitespace-only.
  - **`computed` enable rules — must match R6–R8 exactly:**
    - `canCreate = selected() === null && trimmedName() !== ''`
    - `canUpdate = selected() !== null && modified() && trimmedName() !== ''`
    - `canDelete = selected() !== null`
    - `modified` is a signal toggled true on field edit (`valueChanges`), reset on (re)select and after
      a successful update (R9; faithful toggle, OD-4 — **not** a value comparison).
  - **Table:** a **plain `<table>`** with `@for (c of categories(); track c.musicCategoryId)` — two
    columns ID / Category, row click selects (R11). No Material.
  - **Spinner:** `@if (loading()) { … }` (R16).
  - Each mutation **re-fetches** via `list()` and sets `message` (R12–R15); errors set `error` and
    clear `loading` (R17/R18); `takeUntilDestroyed` for subscription cleanup.

`lib.routes.ts` stays `''` → `MusicFeature` (single view — no in-feature navigation; the desktop app
was one `Scene`). `index.ts` already exports `musicFeatureRoutes`.

State model: signals + `computed()` throughout; no `ObservableList`/manual `Platform.runLater`
equivalent — the table binds to the `categories()` signal.

---

## 4. Seam mapping

API contract is **FROZEN** — verified from `backend/rest-h2` source (`MusicCategoryResource.java`,
`domain/MusicCategory.java`, `schema.sql`, `data.sql`, `application.properties`). **Either** REST
backend on :8080 satisfies it (`rest-mysql` is the same Java, different persistence). No endpoint or
model change.

| Op | Method · path | Request body | Success | Error / notes | Evidence |
|---|---|---|---|---|---|
| **list** | `GET /musiccategories` | — | **`200`**, `MusicCategory[]` | — | `MusicCategoryResource.java:23-26` |
| **one** | `GET /musiccategories/{id}` | — | `200`, `MusicCategory` | missing id → throws `MusicCategoryNotFoundException` → **HTTP `500`** | `:28-35` + `MusicCategoryNotFoundException.java` (no `@ResponseStatus`) |
| **create** | `POST /musiccategories` | `{ musicCategory }` (**no id**) | **`201 Created`** + saved entity **with generated id** | — | `:42-49` (`new ResponseEntity<>(..., HttpStatus.CREATED)`) |
| **update** | `PUT /musiccategories/{id}` | `MusicCategory` | **`200`** + updated entity; server **forces id from path** | **`404`** if id not found | `:51-66` (`ResponseEntity.notFound()` when absent; `setMusicCategoryId(id)`) |
| **delete** | `DELETE /musiccategories/{id}` | — | **`200`, empty body** | **silent no-op** if id missing (`deleteById` swallows) | `:37-40` (returns `void`) |

- **Model:** `MusicCategory = { musicCategoryId: number; musicCategory: string }` — backend entity
  fields `musicCategoryId` / `musicCategory` (`domain/MusicCategory.java:18-21`); JSON keys are exactly
  these (no `@JsonProperty` renaming). The JavaFX domain class matches
  (`SpringBootWebClientFX/.../domain/MusicCategory.java`).
- **Seed:** **8 categories** — Classical, Rock, Jazz, Rap, Country, Musical Theatre, Blues, Alternative
  (`data.sql:18-33`); `schema.sql` auto-creates the table, H2 in-memory, zero setup
  (`application.properties`).
- **CORS:** **none** configured — no `@CrossOrigin`/`WebMvcConfigurer`/`CorsConfig` anywhere in
  `backend/rest-h2/src` (grep confirmed). Dev is handled by the existing `proxy.conf.json`
  (`/musiccategories` → `:8080`), so **no backend change for local dev**; deployed CORS is `[open]`
  (§8).

**Flagged discrepancies — captured, NOT "fixed" (the seam is frozen):**

1. **POST returns `201`, not `200`.** Tests must flush/assert **201** for create (`HttpClient` treats
   2xx as success, so the service code is unaffected; the test assertion is the thing to get right).
2. **`GET /{id}` maps a missing id to `500`, not `404`** (bare `RuntimeException`, no advice). The UI
   **never calls `GET /{id}`**, so this only matters for an edge test if `getOne` is ever added —
   hence OD-2 leans omit.
3. **The JavaFX `MusicRESTService.getMusicCategory(id)` is dead code** — it builds a broken
   `/{id}/` URI (no `/musiccategories` prefix, trailing slash) and is **never called** by either
   `ViewController` (`MusicRESTService.java:36-43`; no caller in `ViewController.java`). Not a
   requirement; do not port the bug.
4. **The `"...Foregin key constraint."` delete-error string is a desktop artifact** — hardcoded on any
   delete failure (`ViewController.java:104-106`); no FK rejection actually occurs deleting a category
   via this endpoint with the seed data. The port surfaces the **real** HTTP error generically (R18,
   OD-3).

Seam → Angular mapping: each `WebClient.block()` call → `HttpClient` method returning an `Observable`;
`baseUrl("http://localhost:8080")` → `API_BASE_URL` token + path (R5); the `Task`/`Thread`/`sleep`
machinery → a `loading` signal (R16), **no equivalent emitted**.

> Constraint check: nothing in this spec requires an endpoint or data-model change. If implementation
> appears to need one, STOP and raise it — do not modify the seam.

---

## 5. UI / brand

Plain HTML/CSS with brand tokens. `[proposed]` mapping:

| Element | Token |
|---|---|
| Page background | `--surface-page` (`#FCFCFD`) |
| Section heading (e.g. "Music Categories") | `--color-ink` (`#121926`) or `--color-primary` (`#6938EF`) |
| Table header / borders | `--surface-2` (`#EEF2F6`) / `--border` (`#E3E8EF`); selected-row tint `--surface-purple` (`#F1ECFE`) |
| Body text / cell text | `--color-text` (`#364152`); status/captions `--color-text-muted` |
| "New" / "Update" buttons (primary actions) | `--color-primary` (`#6938EF`) |
| **"Delete" button (destructive)** | `--color-accent` (`#DE0B5F`) — the one legitimate sparing use (R21) |
| Name input border / focus | `--border` / `--color-primary` |

Layout: the FXML was a `SplitPane` (table left ~40%, form right) — a reasonable web analogue is a
two-pane or stacked **table + form** layout, but the exact arrangement is **not a hard requirement**;
only the brand tokens (R21), the enable rules (R6–R8), and the live region (R22) are. The FXML
`aliceblue→lightblue` gradient and `DropShadow` are **dropped** (placeholder, not brand — R21).

Accessibility: `<table>` with `<th scope="col">` headers; `<label for>` on the name input; the
status/error region `aria-live="polite"` (R22); verify WCAG AA contrast for `--color-primary` and
`--color-accent` on `--surface-page` before shipping; AXE-clean.

---

## 6. Acceptance criteria (one per requirement)

Each phrased to become a unit (`u`) or e2e (`e`) test in the test step. The data-access suite
uses Angular's **`HttpTestingController`** (URL + method + body per op; **POST flushes 201**; DELETE
asserts empty body). The component suite drives the **R6–R9 enable-rule truth tables** — the
highest-value tests.

- **AC1 (R1, u)** — `list()` triggers exactly one `GET` to `…/musiccategories`; flushing an array
  emits that array.
- **AC2 (R2, u)** — `create('Funk')` issues `POST …/musiccategories` with body `{ musicCategory:
  'Funk' }` and **no `musicCategoryId`**; flushing a **`201`** with the saved entity (id present) emits
  it.
- **AC3 (R3, u)** — `update({musicCategoryId:3, musicCategory:'Fusion'})` issues `PUT
  …/musiccategories/3` with the full body; flushing `200` emits the updated entity.
- **AC4 (R4, u)** — `remove(3)` issues `DELETE …/musiccategories/3`; flushing `200` with an **empty
  body** completes with no value.
- **AC5 (R5, u)** — with `API_BASE_URL` = `'http://example.test'`, every request URL begins
  `http://example.test/musiccategories…`; a static scan asserts **no** `localhost`/`:8080` literal in
  the lib source.
- **AC6 (R6, u)** — Create is enabled **iff** no row is selected **and** the trimmed name is non-empty;
  truth-table: {no-sel + name → enabled}, {no-sel + empty → disabled}, {selected + name → disabled}.
- **AC7 (R7, u)** — Update is enabled **iff** a row is selected **and** `modified` **and** trimmed name
  non-empty; the three other corners are disabled.
- **AC8 (R8, u)** — Delete is enabled **iff** a row is selected (independent of field contents — selected
  + empty field still enables Delete).
- **AC9 (R9, u)** — `modified` is false initially and right after selecting a row; becomes true on a
  field edit; returns to false after a successful update.
- **AC5b (R5b, u)** — a whitespace-only name (`"   "`) does **not** enable Create or Update (trim
  applied); `Validators.required` marks the empty control invalid.
- **AC10 (R10, u)** — on init the component calls `list()` once and renders a table row per returned
  category with ID + Category columns; selection starts empty.
- **AC11 (R11, u)** — selecting a row copies its `musicCategory` into the form field and sets
  `selected`; clearing selection empties the field.
- **AC12 (R12, u)** — a successful create calls `list()` again (re-fetch), clears selection, clears the
  field, and sets the status message to `New category <name> created.`
- **AC13 (R13, u)** — a successful update sends the selected row's id with the new name, re-fetches,
  clears selection + field, resets `modified`, and sets status `Category <name> updated.`
- **AC14 (R14, u)** — a successful delete sends the selected id, re-fetches, clears selection + field,
  and sets status `Category <name> deleted.`
- **AC15 (R15, u)** — after a mutation the table reflects the **re-fetched** server list, not an
  optimistic local mutation (assert the second `list()` result is what renders).
- **AC16 (R16, u)** — `loading()` is true between a request's dispatch and its response and false
  after; the spinner element is present **iff** `loading()`; **no** test needs an artificial delay.
- **AC17 (R17, u)** — a failed request (error response) sets a non-empty `error` and leaves `loading()`
  **false** (not stuck).
- **AC18 (R18, u)** — a delete failure's surfaced message is derived from the HTTP error and contains
  **no** "Foreign key"/"Foregin" literal.
- **AC19 (R19, u)** — with `list()` returning `[]`, the table renders empty and Create is still
  enableable (no-selection + non-empty field).
- **AC20 (R20, e)** — loading `/music` directly (deep link) renders the music feature; the route is
  lazy-loaded (its chunk loads on navigation, not in the initial bundle).
- **AC21 (R21, u)** — no `aliceblue`/`lightblue`/gradient or other non-brand color literals in the
  feature styles; Delete uses `--color-accent`, primary actions use `--color-primary`.
- **AC22 (R22, e)** — table has `<th scope="col">` headers, the name input has an associated label, the
  status region is `aria-live="polite"`, and an AXE scan reports no violations.

Coverage check: the §2 requirements list is testable and **every** requirement has a paired
acceptance criterion above (R1↔AC1 … R22↔AC22, plus R5b↔AC5b).

---

## 7. Out of scope / non-goals

- No change to the Spring REST backends or the `/musiccategories` contract. The 201/500/404/empty-body
  behaviors above are **recorded as found**, not altered.
- No CORS configuration on the Spring servers: the app calls them on its own origin — see §8.
- No in-feature view navigation (the desktop app was one `Scene`); `/music` is a single routed view.
- No port of the dead `getMusicCategory(id)` method or its broken URI (§4 discrepancy 3).

---

## 8. Open decisions and their outcomes

These items were left open when the spec was written. Each one ends with the outcome that shipped.

- **`[open]` OD-1 — e2e backend.** Recommended: `rest-h2` — in-memory, auto-seeded (8 rows), zero
  setup; `rest-mysql` needs a live MySQL. Both satisfy the identical seam, so the choice is purely
  test-harness convenience.

  **Outcome:** `rest-h2`.

- **`[open]` OD-2 — expose `getOne`?** Recommended: omit. The UI never calls `GET /{id}`, the
  original JavaFX method is dead code with a broken URI, and the seam maps a missing id to `500` (not
  `404`). Omitting keeps the service to the four operations the UI actually uses.

  **Outcome:** omitted.

- **`[open]` OD-3 — mutation/delete error UX.** Proposed: modernize. Replace the literal "Oops! …" and
  hardcoded "Foreign key constraint" strings with a **generic, non-blocking error message driven by
  the real HTTP status**. The original only ever showed canned strings; this is a deliberate UX
  improvement, not a seam change.

  **Outcome:** modernized. A failure shows `Request failed (HTTP <status>). Please try again.` in the
  live region.

- **`[open]` OD-4 — "modified" semantics.** Recommended: faithful toggle. Keep R9's behavior — set
  `modified` true on **any** field edit, reset on (re)select and after a successful update — rather than
  a value comparison ("is the field different from the selected row's name?"). The toggle is what makes
  the exact Update-enabled rule (R7) hold and matches the FX `onKeyReleased` semantics.

  **Outcome:** faithful toggle.

- **`[decided]` OD-5 — table widget.** Plain `<table>` + `@for`, no Material. Recorded here for
  traceability.

  **Outcome:** plain `<table>`.

- **`[open]` OD-6 — deployed CORS.** Local dev uses `proxy.conf.json` (`/musiccategories` → `:8080`); a
  deployed build against a different origin needs real CORS on the Spring server. **Do not** alter the
  seam to work around it.

  **Outcome:** same origin, so no CORS. `nx serve-static web` serves the production build through
  `frontend/apps/web/server.mjs`, which forwards `/musiccategories` to the server the way the dev
  proxy does. The seam is unchanged.

---

## 9. Inputs verified for this spec

JavaFX source (requirements): both clients' `ViewController.java`, `service/MusicRESTService.java`,
`domain/MusicCategory.java`, `resources/.../view.fxml`, `MusicClientApp.java`, `MusicFXApp.java`,
`application.properties` — diffed file-by-file to confirm the threading-only divergence (§1.1). Seam
(re-confirmed from code): `backend/rest-h2/.../service/MusicCategoryResource.java`,
`.../service/MusicCategoryNotFoundException.java`, `.../service/MusicRepository.java`,
`.../domain/MusicCategory.java`, `.../resources/schema.sql`, `.../resources/data.sql`,
`.../resources/application.properties` (no CORS, no exception advice). Starting scaffold:
`frontend/apps/web/src/app/app.routes.ts` (verified `/music` lazy route + `musicFeatureRoutes`),
`.../proxy.conf.json` (`/musiccategories` → `:8080`), the placeholder `music/{data-access,feature}`
components and `feature/src/lib/lib.routes.ts`, and `tsconfig.base.json` flat aliases
(`@web/music-data-access`, `@web/music-feature`, `@web/shared-util`).

---

## 10. Defects found in verification

The unit suite was green when these were found. A code review and a run against the live `rest-h2`
backend exposed them. The unit tests for D1–D4 carry the defect ID; the D5 fix lives in the e2e suite.

| ID | Defect | Fix |
|---|---|---|
| D1 | The buttons checked the enable rules but not `loading()`, so a double-click sent the request twice. | Every enable rule also requires `!loading()`. |
| D2 | An error left the previous success message on screen. | `fail()` clears the status message. |
| D3 | Table rows responded to the mouse only, so keyboard users couldn't select a row or reach **Update** and **Delete**. | Rows take `tabindex="0"` and select on Enter or Space, with a visible focus ring. |
| D4 | The status line and the spinner were both live regions, so screen readers announced each action twice. | The spinner is `aria-hidden` at its usage site; the status line is the only live region. |
| D5 | The e2e tests broke on shared data: 3 browser projects ran in parallel against one backend that isn't reset between runs. | Exact-match locators, assertions that tolerate leftover rows, and a unique name per project and worker. |
