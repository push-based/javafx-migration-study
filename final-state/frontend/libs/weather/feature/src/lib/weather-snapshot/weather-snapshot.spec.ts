import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { WeatherService } from '@web/weather-data-access';
import { WeatherStore } from '../weather-store';
import { WeatherSnapshot } from './weather-snapshot';

/**
 * Tests for the snapshot view (`WeatherSnapshot`). Source of truth: weather spec
 * R10, R11 / AC10, AC11.
 *
 * The snapshot is the frozen view: it must read the carried value from
 * `WeatherStore`, open NO SSE connection, and inject NO `WeatherService`. To
 * enforce the last two structurally we (a) install a spy `EventSource` and
 * assert it is never constructed, and (b) provide a POISONED `WeatherService`
 * whose `forecast$` throws — if the snapshot ever touched the service the test
 * would blow up.
 *
 * Written before the implementation: each behavioral test first failed because
 * the behavior was missing, not because the test was malformed.
 */

function mountSnapshot(carried: string | null) {
  const poisonedService: Pick<WeatherService, 'forecast$'> = {
    forecast$: () => {
      throw new Error(
        'snapshot must NOT use WeatherService (R10) — forecast$ was called',
      );
    },
  };

  TestBed.configureTestingModule({
    imports: [WeatherSnapshot],
    providers: [
      provideRouter([]),
      { provide: WeatherService, useValue: poisonedService },
    ],
  });

  // Seed the carrier as if the stream view had run.
  const store = TestBed.inject(WeatherStore);
  store.lastForecast.set(carried);

  const fixture: ComponentFixture<WeatherSnapshot> =
    TestBed.createComponent(WeatherSnapshot);
  fixture.detectChanges();

  const valueText = () =>
    (
      fixture.nativeElement.querySelector(
        '[data-testid="snapshot-forecast"]',
      ) as HTMLElement
    ).textContent?.trim() ?? '';

  return { fixture, store, valueText };
}

describe('WeatherSnapshot (snapshot view)', () => {
  let esSpy: jest.Mock;
  let originalEventSource: unknown;

  beforeEach(() => {
    esSpy = jest.fn();
    originalEventSource = (globalThis as Record<string, unknown>)[
      'EventSource'
    ];
    (globalThis as Record<string, unknown>)['EventSource'] = esSpy;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>)['EventSource'] =
      originalEventSource;
    TestBed.resetTestingModule();
  });

  // --- R10 / AC10: frozen snapshot, no stream -------------------------------
  it('AC10 (R10): renders the static "Latest Forecast:" title', () => {
    const { fixture } = mountSnapshot('Foggy and cold. Time for an espresso.');
    const h1 = fixture.nativeElement.querySelector('h1') as HTMLElement;
    expect(h1.textContent?.trim()).toBe('Latest Forecast:');
  });

  it('AC10 (R10): displays the carried value from WeatherStore', () => {
    const { valueText } = mountSnapshot('Foggy and cold. Time for an espresso.');
    expect(valueText()).toBe('Foggy and cold. Time for an espresso.');
  });

  it('AC10 (R10): never opens an SSE connection (no EventSource constructed)', () => {
    mountSnapshot('Hot and sunny. Bring your sunscreen.');
    expect(esSpy).not.toHaveBeenCalled();
  });

  it('AC10 (R10): the frozen value does not change over time', () => {
    const { fixture, valueText } = mountSnapshot(
      'Hot and sunny. Bring your sunscreen.',
    );
    // No stream, so re-running change detection must not alter the value.
    fixture.detectChanges();
    fixture.detectChanges();
    expect(valueText()).toBe('Hot and sunny. Bring your sunscreen.');
  });

  // --- R11 / AC11 (unit slice): a control to return to the stream view -------
  it('AC11 (R11): exposes a control linking back to the stream view', () => {
    const { fixture } = mountSnapshot('Foggy and cold. Time for an espresso.');
    const link = fixture.nativeElement.querySelector(
      '[data-testid="to-stream"]',
    ) as HTMLAnchorElement;
    expect(link).not.toBeNull();
  });
});
