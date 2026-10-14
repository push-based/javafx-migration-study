import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { WeatherService } from '@web/weather-data-access';
import { Observable, Subject } from 'rxjs';
import { WeatherStore } from '../weather-store';
import { WeatherFeature } from './weather-feature';

interface Weather {
  forecast: string;
}

/**
 * Tests for the stream view (`WeatherFeature`). Source of truth: weather spec
 * R6–R9, R11, R12, R15 / AC6–AC9, AC12, AC15.
 *
 * `WeatherService` is mocked with a controllable `Subject<Weather>` so a test
 * can push forecasts and assert the live region updates, and can detect
 * subscribe/unsubscribe (the `EventSource`-close equivalent at this layer). The
 * real `WeatherStore` is used so R9 (carry the value forward) is exercised
 * end-to-end with the snapshot reader.
 *
 * Written before the implementation: each behavioral test first failed because
 * the behavior was missing, not because the test was malformed.
 */

function mountStreamView(forecasts: Subject<Weather>) {
  let subscriptions = 0;
  let teardowns = 0;

  // A controllable stand-in for WeatherService.forecast$(): every subscription
  // is counted, and the teardown (the EventSource-close equivalent) is counted
  // so the destroy/re-subscribe requirements (R8/R12) are observable here.
  const serviceMock: Pick<WeatherService, 'forecast$'> = {
    forecast$: () =>
      new Observable<Weather>((subscriber) => {
        subscriptions++;
        const sub = forecasts.subscribe(subscriber);
        return () => {
          teardowns++;
          sub.unsubscribe();
        };
      }),
  };

  TestBed.configureTestingModule({
    imports: [WeatherFeature],
    providers: [
      provideRouter([]),
      { provide: WeatherService, useValue: serviceMock },
    ],
  });

  const fixture: ComponentFixture<WeatherFeature> =
    TestBed.createComponent(WeatherFeature);
  fixture.detectChanges();

  const store = TestBed.inject(WeatherStore);

  const regionText = () =>
    (
      fixture.nativeElement.querySelector(
        '[data-testid="forecast"]',
      ) as HTMLElement
    ).textContent?.trim() ?? '';

  return {
    fixture,
    store,
    regionText,
    get subscriptions() {
      return subscriptions;
    },
    get teardowns() {
      return teardowns;
    },
  };
}

describe('WeatherFeature (stream view)', () => {
  afterEach(() => TestBed.resetTestingModule());

  // --- R6 / AC6: initial render --------------------------------------------
  it('AC6 (R6): renders the "My Weather Forecast" heading', () => {
    const { fixture } = mountStreamView(new Subject());
    const h1 = fixture.nativeElement.querySelector('h1') as HTMLElement;
    expect(h1.textContent?.trim()).toBe('My Weather Forecast');
  });

  it('AC6 (R6): forecast region is empty before the first event', () => {
    const { regionText } = mountStreamView(new Subject());
    expect(regionText()).toBe('');
  });

  // --- R7 / AC7: live update on every event ---------------------------------
  it('AC7 (R7): updates the forecast region to the latest value on each event', () => {
    const forecasts = new Subject<Weather>();
    const { fixture, regionText } = mountStreamView(forecasts);

    forecasts.next({ forecast: 'Hot and sunny. Bring your sunscreen.' });
    fixture.detectChanges();
    expect(regionText()).toBe('Hot and sunny. Bring your sunscreen.');

    forecasts.next({ forecast: 'Foggy and cold. Time for an espresso.' });
    fixture.detectChanges();
    expect(regionText()).toBe('Foggy and cold. Time for an espresso.');
  });

  // --- R8 / AC8: teardown on destroy ----------------------------------------
  it('AC8 (R8): subscribes on init and unsubscribes when the component is destroyed', () => {
    const view = mountStreamView(new Subject());
    expect(view.subscriptions).toBe(1);
    expect(view.teardowns).toBe(0);

    view.fixture.destroy();
    expect(view.teardowns).toBe(1);
  });

  // --- R9 / AC9: carry the latest value forward into the store --------------
  it('AC9 (R9): writes the latest forecast into WeatherStore for the snapshot view', () => {
    const forecasts = new Subject<Weather>();
    const { fixture, store } = mountStreamView(forecasts);

    forecasts.next({ forecast: 'Rain is on the way. Don’t forget your umbrella.' });
    fixture.detectChanges();

    expect(store.lastForecast()).toBe(
      'Rain is on the way. Don’t forget your umbrella.',
    );
  });

  // --- R12 / AC12: returning re-subscribes fresh ----------------------------
  it('AC12 (R12): re-mounting the stream view opens a fresh subscription', () => {
    const first = mountStreamView(new Subject());
    expect(first.subscriptions).toBe(1);
    first.fixture.destroy();
    TestBed.resetTestingModule();

    const second = mountStreamView(new Subject());
    expect(second.subscriptions).toBe(1);
    expect(second.teardowns).toBe(0);
  });

  // --- R15 / AC15: accessible live region -----------------------------------
  it('AC15 (R15): the forecast region is an aria-live="polite" live region', () => {
    const { fixture } = mountStreamView(new Subject());
    const region = fixture.nativeElement.querySelector(
      '[data-testid="forecast"]',
    ) as HTMLElement;
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  // --- R11 / AC11 (unit slice): a control to reach the snapshot exists -------
  it('AC11 (R11): exposes a control linking to the snapshot view', () => {
    const { fixture } = mountStreamView(new Subject());
    const link = fixture.nativeElement.querySelector(
      '[data-testid="to-snapshot"]',
    ) as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toContain('latest');
  });
});
