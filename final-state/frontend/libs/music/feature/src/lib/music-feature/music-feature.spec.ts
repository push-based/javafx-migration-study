import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MusicCategory, MusicCategoryService } from '@web/music-data-access';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Observable, Subject, of, throwError } from 'rxjs';
import { MusicFeature } from './music-feature';

/**
 * Tests for the Music CRUD view (`MusicFeature`). Source of truth: the music
 * spec R5b–R22 / AC5b–AC22 (`docs/specs/music.md`). Both JavaFX clients collapse
 * onto this one component (§1.1).
 *
 * `MusicCategoryService` is mocked with controllable `jest.fn()`s returning
 * `of(...)` / `throwError(...)` (and a `Subject` where a test must hold a request
 * in flight to observe `loading`). The highest-value tests are the **R6–R9
 * enable-rule truth tables** — driven through the real form control + `select()`
 * so the whole chain (field mirror → modified flag → computed rules) is exercised.
 *
 * Written before the implementation: each behavioral test first failed because
 * the behavior was missing, not because the test was malformed.
 *
 * The `D1`–`D4` tests cover defects found in verification against the live
 * backend (`docs/specs/music.md` §10).
 */

const SEED: MusicCategory[] = [
  { musicCategoryId: 1, musicCategory: 'Classical' },
  { musicCategoryId: 2, musicCategory: 'Rock' },
  { musicCategoryId: 3, musicCategory: 'Jazz' },
];

/** A fully controllable mock of the four service methods the UI uses. */
interface ServiceMock {
  list: jest.Mock<Observable<MusicCategory[]>, []>;
  create: jest.Mock<Observable<MusicCategory>, [string]>;
  update: jest.Mock<Observable<MusicCategory>, [MusicCategory]>;
  remove: jest.Mock<Observable<void>, [number]>;
}

function makeServiceMock(): ServiceMock {
  return {
    list: jest.fn(() => of(SEED)),
    create: jest.fn((name: string) =>
      of({ musicCategoryId: 99, musicCategory: name }),
    ),
    update: jest.fn((c: MusicCategory) => of(c)),
    remove: jest.fn<Observable<void>, [number]>(() =>
      of(undefined as unknown as void),
    ),
  };
}

function mount(service: ServiceMock) {
  TestBed.configureTestingModule({
    imports: [MusicFeature],
    providers: [{ provide: MusicCategoryService, useValue: service }],
  });

  const fixture: ComponentFixture<MusicFeature> =
    TestBed.createComponent(MusicFeature);
  const component = fixture.componentInstance;
  fixture.detectChanges();

  /** Type into the name field exactly as a user would (drives valueChanges). */
  const typeName = (value: string) => {
    component.form.controls.categoryName.setValue(value);
    fixture.detectChanges();
  };

  return { fixture, component, typeName };
}

describe('MusicFeature (Music CRUD view)', () => {
  afterEach(() => TestBed.resetTestingModule());

  // === R10 / AC10: on init, list once and render the table ==================
  describe('initial load (R10)', () => {
    it('AC10 (R10): calls list() exactly once on init', () => {
      const service = makeServiceMock();
      mount(service);
      expect(service.list).toHaveBeenCalledTimes(1);
    });

    it('AC10 (R10): renders one row per returned category with ID + Category', () => {
      const service = makeServiceMock();
      const { fixture } = mount(service);
      const rows = fixture.nativeElement.querySelectorAll(
        '[data-testid="category-row"]',
      );
      expect(rows).toHaveLength(SEED.length);
      expect(rows[0].textContent).toContain('1');
      expect(rows[0].textContent).toContain('Classical');
    });

    it('AC10 (R10): selection starts empty', () => {
      const { component } = mount(makeServiceMock());
      expect(component.selected()).toBeNull();
    });
  });

  // === R6 / AC6: Create enable truth table ==================================
  describe('canCreate — R6 (no selection AND non-empty name)', () => {
    it('AC6: no selection + non-empty name → enabled', () => {
      const { component, typeName } = mount(makeServiceMock());
      typeName('Funk');
      expect(component.selected()).toBeNull();
      expect(component.canCreate()).toBe(true);
    });

    it('AC6: no selection + empty name → disabled', () => {
      const { component } = mount(makeServiceMock());
      expect(component.canCreate()).toBe(false);
    });

    it('AC6: a row selected (even with a name) → disabled', () => {
      const { component, typeName } = mount(makeServiceMock());
      component.select(SEED[0]);
      typeName('Funk');
      expect(component.canCreate()).toBe(false);
    });
  });

  // === R7 / AC7: Update enable truth table ==================================
  describe('canUpdate — R7 (selected AND modified AND non-empty)', () => {
    it('AC7: selected + modified + non-empty name → enabled', () => {
      const { component, typeName } = mount(makeServiceMock());
      component.select(SEED[0]);
      typeName('Classical Edited'); // an edit flips modified true
      expect(component.canUpdate()).toBe(true);
    });

    it('AC7: selected + NOT modified → disabled', () => {
      const { component } = mount(makeServiceMock());
      component.select(SEED[0]); // select resets modified → false, field copied
      expect(component.modified()).toBe(false);
      expect(component.canUpdate()).toBe(false);
    });

    it('AC7: no selection (even modified + name) → disabled', () => {
      const { component, typeName } = mount(makeServiceMock());
      typeName('Whatever');
      expect(component.selected()).toBeNull();
      expect(component.canUpdate()).toBe(false);
    });

    it('AC7: selected + modified + empty name → disabled', () => {
      const { component, typeName } = mount(makeServiceMock());
      component.select(SEED[0]);
      typeName(''); // edit to empty
      expect(component.canUpdate()).toBe(false);
    });
  });

  // === R8 / AC8: Delete enable truth table ==================================
  describe('canDelete — R8 (a row is selected, no field condition)', () => {
    it('AC8: a row selected → enabled', () => {
      const { component } = mount(makeServiceMock());
      component.select(SEED[0]);
      expect(component.canDelete()).toBe(true);
    });

    it('AC8: a row selected with an empty field still enables Delete', () => {
      const { component, typeName } = mount(makeServiceMock());
      component.select(SEED[0]);
      typeName('');
      expect(component.canDelete()).toBe(true);
    });

    it('AC8: no selection → disabled', () => {
      const { component } = mount(makeServiceMock());
      expect(component.canDelete()).toBe(false);
    });
  });

  // === R9 / AC9: "modified" lifecycle =======================================
  describe('modified flag — R9 (faithful toggle, OD-4)', () => {
    it('AC9: false initially', () => {
      const { component } = mount(makeServiceMock());
      expect(component.modified()).toBe(false);
    });

    it('AC9: false right after selecting a row', () => {
      const { component, typeName } = mount(makeServiceMock());
      typeName('edit'); // would set modified true...
      component.select(SEED[1]); // ...selecting resets it to false
      expect(component.modified()).toBe(false);
    });

    it('AC9: becomes true on a field edit', () => {
      const { component, typeName } = mount(makeServiceMock());
      typeName('Rock!');
      expect(component.modified()).toBe(true);
    });

    it('AC9: returns to false after a successful update', () => {
      const { component, typeName } = mount(makeServiceMock());
      component.select(SEED[1]);
      typeName('Rock Renamed');
      expect(component.modified()).toBe(true);
      component.updateCategory();
      expect(component.modified()).toBe(false);
    });
  });

  // === R5b / AC5b: required + whitespace trimming ===========================
  describe('required field + whitespace (R5b)', () => {
    it('AC5b: a whitespace-only name does NOT enable Create', () => {
      const { component, typeName } = mount(makeServiceMock());
      typeName('   ');
      expect(component.trimmedName()).toBe('');
      expect(component.canCreate()).toBe(false);
    });

    it('AC5b: a whitespace-only name does NOT enable Update', () => {
      const { component, typeName } = mount(makeServiceMock());
      component.select(SEED[0]);
      typeName('   ');
      expect(component.canUpdate()).toBe(false);
    });

    it('AC5b: Validators.required marks the empty control invalid', () => {
      const { component } = mount(makeServiceMock());
      expect(component.form.controls.categoryName.hasError('required')).toBe(
        true,
      );
    });
  });

  // === R11 / AC11: selection copies name; deselect clears ===================
  describe('selection ⇄ field (R11)', () => {
    it('AC11: selecting a row copies its name into the field and sets selected', () => {
      const { component } = mount(makeServiceMock());
      component.select(SEED[2]);
      expect(component.selected()).toEqual(SEED[2]);
      expect(component.form.controls.categoryName.value).toBe('Jazz');
    });

    it('AC11: clearing the selection empties the field', () => {
      const { component } = mount(makeServiceMock());
      component.select(SEED[2]);
      component.clearSelection();
      expect(component.selected()).toBeNull();
      expect(component.form.controls.categoryName.value).toBe('');
    });
  });

  // === R12 / AC12: create round-trip ========================================
  describe('create round-trip (R12)', () => {
    it('AC12: create() sends the typed name then RE-FETCHES the list', () => {
      const service = makeServiceMock();
      const { component, typeName } = mount(service);
      service.list.mockClear(); // ignore the init load

      typeName('Funk');
      component.createCategory();

      expect(service.create).toHaveBeenCalledWith('Funk');
      expect(service.list).toHaveBeenCalledTimes(1); // re-fetch (R15)
    });

    it('AC12: a successful create clears selection + field and sets the status', () => {
      const service = makeServiceMock();
      const { component, typeName } = mount(service);

      typeName('Funk');
      component.createCategory();

      expect(component.selected()).toBeNull();
      expect(component.form.controls.categoryName.value).toBe('');
      expect(component.message()).toBe('New category Funk created.');
    });
  });

  // === R13 / AC13: update round-trip ========================================
  describe('update round-trip (R13)', () => {
    it('AC13: update() sends the selected id with the new name, then re-fetches', () => {
      const service = makeServiceMock();
      const { component, typeName } = mount(service);
      service.list.mockClear();

      component.select(SEED[1]); // Rock, id 2
      typeName('Rock Renamed');
      component.updateCategory();

      expect(service.update).toHaveBeenCalledWith({
        musicCategoryId: 2,
        musicCategory: 'Rock Renamed',
      });
      expect(service.list).toHaveBeenCalledTimes(1);
    });

    it('AC13: a successful update clears selection + field, resets modified, sets status', () => {
      const service = makeServiceMock();
      const { component, typeName } = mount(service);

      component.select(SEED[1]);
      typeName('Rock Renamed');
      component.updateCategory();

      expect(component.selected()).toBeNull();
      expect(component.form.controls.categoryName.value).toBe('');
      expect(component.modified()).toBe(false);
      expect(component.message()).toBe('Category Rock Renamed updated.');
    });
  });

  // === R14 / AC14: delete round-trip ========================================
  describe('delete round-trip (R14)', () => {
    it('AC14: delete() sends the selected id then re-fetches', () => {
      const service = makeServiceMock();
      const { component } = mount(service);
      service.list.mockClear();

      component.select(SEED[2]); // Jazz, id 3
      component.deleteCategory();

      expect(service.remove).toHaveBeenCalledWith(3);
      expect(service.list).toHaveBeenCalledTimes(1);
    });

    it('AC14: a successful delete clears selection + field and sets status', () => {
      const service = makeServiceMock();
      const { component } = mount(service);

      component.select(SEED[2]);
      component.deleteCategory();

      expect(component.selected()).toBeNull();
      expect(component.form.controls.categoryName.value).toBe('');
      expect(component.message()).toBe('Category Jazz deleted.');
    });
  });

  // === R15 / AC15: server is the source of truth ============================
  it('AC15 (R15): after a mutation the table reflects the RE-FETCHED list, not an optimistic edit', () => {
    const service = makeServiceMock();
    const afterDelete: MusicCategory[] = [SEED[0], SEED[1]]; // Jazz gone server-side
    const { component, fixture } = mount(service);

    // The re-fetch (the 2nd list() call) returns the server's post-delete view.
    service.list.mockReturnValueOnce(of(afterDelete));

    component.select(SEED[2]);
    component.deleteCategory();
    fixture.detectChanges();

    expect(component.categories()).toEqual(afterDelete);
    const rows = fixture.nativeElement.querySelectorAll(
      '[data-testid="category-row"]',
    );
    expect(rows).toHaveLength(2);
  });

  // === R16 / AC16: loading signal toggles around a request ==================
  describe('loading signal (R16)', () => {
    it('AC16: loading() is true while a request is in flight and false after it resolves', () => {
      const service = makeServiceMock();
      const gate = new Subject<MusicCategory[]>();
      // Hold the re-fetch open so the in-flight state is observable.
      service.list.mockReturnValueOnce(of(SEED)); // init load completes
      const { component, typeName } = mount(service);

      service.list.mockReturnValueOnce(gate.asObservable());
      typeName('Funk');
      component.createCategory();

      expect(component.loading()).toBe(true); // request outstanding

      gate.next(SEED);
      gate.complete();
      expect(component.loading()).toBe(false); // settled
    });

    it('AC16: the spinner element is present iff loading()', () => {
      const service = makeServiceMock();
      const { component, fixture } = mount(service);

      expect(
        fixture.nativeElement.querySelector('[data-testid="loading"]'),
      ).toBeNull();

      component.loading.set(true);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('[data-testid="loading"]'),
      ).not.toBeNull();
    });
  });

  // === R17 / R18 / AC17 / AC18: error handling ==============================
  describe('error handling (R17/R18)', () => {
    it('AC17: a failed request sets a non-empty error and leaves loading() false (not stuck)', () => {
      const service = makeServiceMock();
      const { component, typeName } = mount(service);

      service.create.mockReturnValueOnce(
        throwError(() => ({ status: 500, message: 'Internal Server Error' })),
      );
      typeName('Funk');
      component.createCategory();

      expect(component.error()).toBeTruthy();
      expect(component.loading()).toBe(false);
    });

    it('AC18: a delete failure message is derived from the HTTP error — no "Foreign key" literal', () => {
      const service = makeServiceMock();
      const { component } = mount(service);

      service.remove.mockReturnValueOnce(
        throwError(() => ({ status: 500, statusText: 'Server Error' })),
      );
      component.select(SEED[2]);
      component.deleteCategory();

      expect(component.error()).toBeTruthy();
      expect(component.error()).not.toMatch(/Foreign key/i);
      expect(component.error()).not.toMatch(/Foregin/i);
    });
  });

  // === R19 / AC19: empty list stays usable ==================================
  describe('empty list (R19)', () => {
    it('AC19: with no categories the table renders empty and Create is still enableable', () => {
      const service = makeServiceMock();
      service.list.mockReturnValue(of([]));
      const { component, fixture, typeName } = mount(service);

      const rows = fixture.nativeElement.querySelectorAll(
        '[data-testid="category-row"]',
      );
      expect(rows).toHaveLength(0);

      typeName('First Ever');
      expect(component.canCreate()).toBe(true);
    });
  });

  // === D1: in-flight guard — no button enabled while a request is outstanding
  // (double-submit re-entrancy: duplicate POST, double DELETE→404-as-error,
  // late error overwriting good state). Folds !loading() into all three rules.
  describe('in-flight guard (D1) — every action disabled while loading()', () => {
    it('D1: canCreate is false while loading(), true again once it clears', () => {
      const { component, typeName } = mount(makeServiceMock());
      typeName('Funk'); // no selection + non-empty name → would enable Create
      expect(component.canCreate()).toBe(true);

      component.loading.set(true);
      expect(component.canCreate()).toBe(false);

      component.loading.set(false);
      expect(component.canCreate()).toBe(true);
    });

    it('D1: canUpdate is false while loading(), true again once it clears', () => {
      const { component, typeName } = mount(makeServiceMock());
      component.select(SEED[0]);
      typeName('Classical Edited'); // selected + modified + non-empty → would enable
      expect(component.canUpdate()).toBe(true);

      component.loading.set(true);
      expect(component.canUpdate()).toBe(false);

      component.loading.set(false);
      expect(component.canUpdate()).toBe(true);
    });

    it('D1: canDelete is false while loading(), true again once it clears', () => {
      const { component } = mount(makeServiceMock());
      component.select(SEED[0]); // a row selected → would enable Delete
      expect(component.canDelete()).toBe(true);

      component.loading.set(true);
      expect(component.canDelete()).toBe(false);

      component.loading.set(false);
      expect(component.canDelete()).toBe(true);
    });
  });

  // === D2: fail() must clear the stale success message ======================
  describe('error clears stale success message (D2)', () => {
    it('D2: a failing op after a successful one sets error and clears message', () => {
      const service = makeServiceMock();
      const { component, typeName } = mount(service);

      // First: a successful create sets the status message.
      typeName('Funk');
      component.createCategory();
      expect(component.message()).toBe('New category Funk created.');

      // Then: a failing create must surface error AND clear the stale message,
      // so the template's error-or-message never resurfaces the old success.
      service.create.mockReturnValueOnce(
        throwError(() => ({ status: 500, statusText: 'Server Error' })),
      );
      typeName('Soul');
      component.createCategory();

      expect(component.error()).toBeTruthy();
      expect(component.message()).toBe('');
    });
  });

  // === D3 / R22 / AC22: keyboard-operable row selection =====================
  describe('keyboard-operable row selection (D3, R22)', () => {
    it('D3: pressing Enter on a row selects that category', () => {
      const { component, fixture } = mount(makeServiceMock());
      const row: HTMLElement = fixture.nativeElement.querySelectorAll(
        '[data-testid="category-row"]',
      )[1]; // Rock
      row.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      fixture.detectChanges();
      expect(component.selected()).toEqual(SEED[1]);
    });

    it('D3: pressing Space on a row selects that category', () => {
      const { component, fixture } = mount(makeServiceMock());
      const row: HTMLElement = fixture.nativeElement.querySelectorAll(
        '[data-testid="category-row"]',
      )[2]; // Jazz
      row.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
      );
      fixture.detectChanges();
      expect(component.selected()).toEqual(SEED[2]);
    });

    it('D3: rows are reachable by keyboard (tabindex=0)', () => {
      const { fixture } = mount(makeServiceMock());
      const row: HTMLElement = fixture.nativeElement.querySelector(
        '[data-testid="category-row"]',
      );
      expect(row.getAttribute('tabindex')).toBe('0');
    });
  });

  // === D4: a single polite live region (no double-narration) ================
  // The spinner host is itself role="status" aria-live="polite"; with the status
  // <p> also polite, every op was announced twice. The fix marks the spinner
  // aria-hidden at this usage site so the <p> is the ONLY announcing live region
  // (the spinner stays visually present).
  describe('single live region (D4)', () => {
    it('D4: the spinner is aria-hidden at the usage site while loading()', () => {
      const { component, fixture } = mount(makeServiceMock());
      component.loading.set(true);
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector(
        '[data-testid="loading"]',
      );
      expect(spinner).not.toBeNull(); // still visually present
      expect(spinner.getAttribute('aria-hidden')).toBe('true');
    });

    it('D4: exactly one announcing (non-hidden) [aria-live] region exists while loading()', () => {
      const { component, fixture } = mount(makeServiceMock());
      component.loading.set(true);
      fixture.detectChanges();

      const announcing = Array.from(
        fixture.nativeElement.querySelectorAll('[aria-live]'),
      ).filter(
        (el) => (el as HTMLElement).getAttribute('aria-hidden') !== 'true',
      );
      expect(announcing).toHaveLength(1);
      expect((announcing[0] as HTMLElement).getAttribute('data-testid')).toBe(
        'status',
      );
    });
  });

  // === R21 / AC21: brand-token guardrail (no FXML demo colors) ==============
  it('AC21 (R21): the feature styles contain no aliceblue/lightblue/gradient literal', () => {
    // Guardrail:
    // the FXML demo gradient/DropShadow must never reappear in the brand styles.
    const scss = readFileSync(join(__dirname, 'music-feature.scss'), 'utf8');
    expect(scss).not.toMatch(/aliceblue/i);
    expect(scss).not.toMatch(/lightblue/i);
    expect(scss).not.toMatch(/linear-gradient/i);
  });
});
