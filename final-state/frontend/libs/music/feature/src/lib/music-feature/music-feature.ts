import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MusicCategory, MusicCategoryService } from '@web/music-data-access';
import { Spinner } from '@web/shared-ui';
import { Observable, switchMap } from 'rxjs';

/**
 * Music CRUD view — the Angular replacement for the JavaFX `ViewController` /
 * `view.fxml`, onto which BOTH desktop clients collapse (`docs/specs/music.md`
 * §1.1, §3). Spec requirements R5b–R22.
 *
 * The JavaFX `Task`/`Thread`/`Thread.sleep(2500)` machinery and the
 * blocking-vs-`Task` contrast dissolve into a single `loading` signal: in the
 * browser `HttpClient` is async by construction (spec §1.1, R16). Every mutation
 * treats the **server as the source of truth** — on success it re-fetches the
 * whole list via `list()` rather than editing the table optimistically (R15).
 */
@Component({
  selector: 'lib-music-feature',
  imports: [ReactiveFormsModule, Spinner],
  templateUrl: './music-feature.html',
  styleUrl: './music-feature.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MusicFeature {
  private readonly service = inject(MusicCategoryService);
  private readonly destroyRef = inject(DestroyRef);

  /** All categories from the server — the table's source of truth (R10/R15). */
  readonly categories: WritableSignal<MusicCategory[]> = signal<MusicCategory[]>(
    [],
  );

  /** The currently selected row, or null when nothing is selected (R11). */
  readonly selected: WritableSignal<MusicCategory | null> =
    signal<MusicCategory | null>(null);

  /** True while any list/create/update/delete request is in flight (R16). */
  readonly loading: WritableSignal<boolean> = signal(false);

  /** Status line after a successful mutation (R12–R14). */
  readonly message: WritableSignal<string> = signal('');

  /** Error banner text from the real HTTP failure, or null (R17/R18). */
  readonly error: WritableSignal<string | null> = signal<string | null>(null);

  /**
   * "modified" flag — true on ANY edit of the name field, reset on (re)select
   * and after a successful update (R9, faithful toggle per OD-4, NOT a value
   * comparison).
   */
  readonly modified: WritableSignal<boolean> = signal(false);

  /** Reactive form with the one required name field (R5b). */
  readonly form = new FormGroup({
    categoryName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  /** Name signal mirrors the control value so the enable rules are reactive. */
  protected readonly name: WritableSignal<string> = signal('');

  /** The trimmed name — whitespace must not satisfy R6/R7 (R5b). */
  readonly trimmedName: Signal<string> = computed(() => this.name().trim());

  // --- enable rules (R6–R8) -------------------------------------------------
  //
  // Every rule also folds in `!loading()`: while any request is in flight the
  // buttons are disabled, so a double-click within the request window cannot
  // re-enter (duplicate POST, double DELETE → 404-as-error, a late error
  // overwriting a good state). The selection/name/modified conditions are
  // exactly R6–R8; the loading guard is additive.

  /** R6 — Create enabled iff no row selected AND trimmed name non-empty (and idle). */
  readonly canCreate: Signal<boolean> = computed(
    () =>
      this.selected() === null && this.trimmedName() !== '' && !this.loading(),
  );

  /** R7 — Update enabled iff a row selected AND modified AND trimmed non-empty (and idle). */
  readonly canUpdate: Signal<boolean> = computed(
    () =>
      this.selected() !== null &&
      this.modified() &&
      this.trimmedName() !== '' &&
      !this.loading(),
  );

  /** R8 — Delete enabled iff a row is selected (no field condition) AND idle. */
  readonly canDelete: Signal<boolean> = computed(
    () => this.selected() !== null && !this.loading(),
  );

  constructor() {
    // Mirror the control into the `name` signal (keeps the enable rules
    // reactive) and flip `modified` true on ANY user edit (R9). Programmatic
    // resets (select / clear / post-mutation) re-set `modified` false *after*
    // writing the value, so this listener never leaves a stale flag.
    this.form.controls.categoryName.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.name.set(value);
        this.modified.set(true);
      });

    this.load();
  }

  /** R10 — fetch + render the list (called on init, and as the re-fetch). */
  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (categories) => {
          this.categories.set(categories);
          this.loading.set(false);
        },
        error: (err: unknown) => this.fail(err),
      });
  }

  /** R11 — select a row: copy its name into the field, reset modified → false. */
  select(category: MusicCategory): void {
    this.selected.set(category);
    this.setField(category.musicCategory);
    this.modified.set(false);
  }

  /**
   * R11/R22 — keyboard row selection via Space. Space would otherwise scroll
   * the page, so swallow the default before selecting (Enter binds to `select`
   * directly — it has no default to suppress).
   */
  selectFromKey(event: Event, category: MusicCategory): void {
    event.preventDefault();
    this.select(category);
  }

  /** R11 — clear the selection and the field. */
  clearSelection(): void {
    this.selected.set(null);
    this.setField('');
    this.modified.set(false);
  }

  /** R12 — create round-trip (POST → re-fetch → clear → status). */
  createCategory(): void {
    const name = this.trimmedName();
    this.mutate(
      this.service.create(name),
      `New category ${name} created.`,
    );
  }

  /** R13 — update round-trip (PUT → re-fetch → clear → reset modified). */
  updateCategory(): void {
    const current = this.selected();
    if (current === null) {
      return;
    }
    const name = this.trimmedName();
    const edited: MusicCategory = { ...current, musicCategory: name };
    this.mutate(this.service.update(edited), `Category ${name} updated.`);
  }

  /** R14 — delete round-trip (DELETE → re-fetch → clear → status). */
  deleteCategory(): void {
    const current = this.selected();
    if (current === null) {
      return;
    }
    // Capture the name now — the field/selection are cleared on success.
    const name = current.musicCategory;
    this.mutate(this.service.remove(current.musicCategoryId), `Category ${name} deleted.`);
  }

  /**
   * Run a mutation, then treat the server as the source of truth: re-fetch the
   * whole list (R15), clear the selection + field, set the status message, and
   * drop `loading`. Any failure surfaces a generic, HTTP-derived error and
   * leaves `loading` false (R17/R18) — never stuck.
   */
  private mutate(
    mutation$: Observable<unknown>,
    successMessage: string,
  ): void {
    this.loading.set(true);
    this.error.set(null);
    mutation$
      .pipe(
        switchMap(() => this.service.list()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (categories) => {
          this.categories.set(categories);
          this.clearSelection();
          this.message.set(successMessage);
          this.loading.set(false);
        },
        error: (err: unknown) => this.fail(err),
      });
  }

  /** Surface a generic, status-derived error (R18: no hardcoded FK cause). */
  private fail(err: unknown): void {
    // Clear any stale success line: the template shows error-or-message, so a
    // leftover "… created." must not resurface alongside a fresh error (D2).
    this.message.set('');
    this.error.set(this.describeError(err));
    this.loading.set(false);
  }

  /**
   * Build a generic operator-facing error string from the real HTTP failure —
   * NOT the JavaFX hardcoded "Oops!"/"Foreign key constraint" text (R18, OD-3).
   */
  private describeError(err: unknown): string {
    const status =
      typeof err === 'object' && err !== null && 'status' in err
        ? Number((err as { status: unknown }).status)
        : 0;
    return status > 0
      ? `Request failed (HTTP ${status}). Please try again.`
      : 'Request failed. Please try again.';
  }

  /** Write the form field without leaving `modified` set by the value change. */
  private setField(value: string): void {
    this.form.controls.categoryName.setValue(value);
  }
}
