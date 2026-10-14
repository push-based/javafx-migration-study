import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@web/shared-util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Subscription } from 'rxjs';
import { Weather } from './weather.model';
import { WeatherService } from './weather.service';

/**
 * Tests for `WeatherService` — the SSE wrapper. Source of truth: the weather
 * spec R1–R5 / AC1–AC5 (`docs/specs/weather.md`).
 *
 * jsdom has NO `EventSource`, so these tests install a controllable
 * `FakeEventSource` on `globalThis.EventSource`. The fake captures every
 * instance, lets a test drive `message`/`error` events, and spies on `close()`
 * — that is the only way to assert R1–R4 without a real network/SSE.
 *
 * Written before the implementation: each behavioral test first failed because
 * the behavior was missing, not because the test was malformed.
 */

/** Controllable stand-in for the browser's `EventSource`. */
class FakeEventSource {
  /** Every instance the code-under-test constructed, in order. */
  static instances: FakeEventSource[] = [];

  // EventSource readyState constants (kept for API fidelity).
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly url: string;
  readyState = FakeEventSource.CONNECTING;

  // The implementation may assign these handler properties...
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onopen: ((ev: Event) => void) | null = null;

  // ...or use addEventListener. Capture both so the test works either way.
  private readonly listeners = new Map<string, Set<(ev: Event) => void>>();

  close = jest.fn(() => {
    this.readyState = FakeEventSource.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (ev: Event) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(cb);
  }

  removeEventListener(type: string, cb: (ev: Event) => void): void {
    this.listeners.get(type)?.delete(cb);
  }

  /** Dispatch a default (unnamed) `message` event carrying `data`. */
  emitMessage(data: string): void {
    const ev = { type: 'message', data } as MessageEvent;
    this.onmessage?.(ev);
    this.listeners.get('message')?.forEach((cb) => cb(ev));
  }

  /** Dispatch a NAMED event — used to prove the wrapper ignores named events. */
  emitNamed(name: string, data: string): void {
    const ev = { type: name, data } as MessageEvent;
    this.listeners.get(name)?.forEach((cb) => cb(ev));
  }

  /** Dispatch a connection/stream error. */
  emitError(): void {
    const ev = { type: 'error' } as Event;
    this.onerror?.(ev);
    this.listeners.get('error')?.forEach((cb) => cb(ev));
  }

  static reset(): void {
    FakeEventSource.instances = [];
  }

  static get last(): FakeEventSource {
    const inst = FakeEventSource.instances.at(-1);
    if (!inst) {
      throw new Error(
        'No EventSource was constructed — forecast$() did not open a stream',
      );
    }
    return inst;
  }
}

const FOGGY = 'Foggy and cold. Time for an espresso.';

function makeService(base = ''): WeatherService {
  TestBed.configureTestingModule({
    providers: [{ provide: API_BASE_URL, useValue: base }],
  });
  return TestBed.inject(WeatherService);
}

describe('WeatherService (SSE wrapper)', () => {
  let originalEventSource: unknown;

  beforeEach(() => {
    FakeEventSource.reset();
    originalEventSource = (globalThis as Record<string, unknown>)[
      'EventSource'
    ];
    (globalThis as Record<string, unknown>)['EventSource'] = FakeEventSource;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>)['EventSource'] =
      originalEventSource;
    TestBed.resetTestingModule();
  });

  it('is provided in root and injectable', () => {
    expect(makeService()).toBeInstanceOf(WeatherService);
  });

  // --- R1 / AC1: open the stream, emit one Weather per event -----------------
  it('AC1 (R1): subscribing opens an EventSource at {base}/weather/forecast and emits a Weather per event', () => {
    const service = makeService('');
    const received: Weather[] = [];

    const sub = service.forecast$().subscribe((w) => received.push(w));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.last.url).toBe('/weather/forecast');

    FakeEventSource.last.emitMessage(JSON.stringify({ forecast: FOGGY }));

    expect(received).toEqual([{ forecast: FOGGY }]);
    sub.unsubscribe();
  });

  // --- R2 / AC2: parse JSON from the DEFAULT message event, not a named one --
  it('AC2 (R2): a default `message` event is parsed into { forecast }', () => {
    const service = makeService('');
    const received: Weather[] = [];
    const sub = service.forecast$().subscribe((w) => received.push(w));

    FakeEventSource.last.emitMessage(`{"forecast":"${FOGGY}"}`);

    expect(received).toEqual([{ forecast: FOGGY }]);
    sub.unsubscribe();
  });

  it('AC2 (R2): a NAMED `weather` event is ignored (wrapper listens on onmessage, not addEventListener("weather"))', () => {
    const service = makeService('');
    const received: Weather[] = [];
    const sub = service.forecast$().subscribe((w) => received.push(w));

    // The server emits a bare Flux<Weather> — events are unnamed. A named
    // listener must receive nothing.
    FakeEventSource.last.emitNamed('weather', `{"forecast":"${FOGGY}"}`);

    expect(received).toEqual([]);
    sub.unsubscribe();
  });

  // --- R3 / AC3: teardown closes the connection (THE critical test) ----------
  it('AC3 (R3): unsubscribing closes the EventSource exactly once and stops emissions', () => {
    const service = makeService('');
    const received: Weather[] = [];
    const sub: Subscription = service
      .forecast$()
      .subscribe((w) => received.push(w));

    const es = FakeEventSource.last;
    es.emitMessage(`{"forecast":"${FOGGY}"}`);
    expect(received).toHaveLength(1);

    sub.unsubscribe();

    expect(es.close).toHaveBeenCalledTimes(1);

    // Events after teardown must NOT reach the (now-closed) subscriber.
    es.emitMessage('{"forecast":"Hot and sunny. Bring your sunscreen."}');
    expect(received).toHaveLength(1);
  });

  // --- R4 / AC4: errors go to the Observable error channel -------------------
  it('AC4 (R4): an EventSource error invokes the Observable error callback (not next/complete)', () => {
    const service = makeService('');
    const next = jest.fn();
    const error = jest.fn();
    const complete = jest.fn();

    service.forecast$().subscribe({ next, error, complete });
    FakeEventSource.last.emitError();

    expect(error).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  // --- R5 / AC5: base URL from the token, never hardcoded --------------------
  it('AC5 (R5): the EventSource URL is built from API_BASE_URL', () => {
    const service = makeService('http://example.test');
    const sub = service.forecast$().subscribe();

    expect(FakeEventSource.last.url).toBe('http://example.test/weather/forecast');
    sub.unsubscribe();
  });

  it('AC5 (R5): the lib source contains no hardcoded localhost / :8080 literal', () => {
    const root = join(__dirname);
    const sources = ['weather.service.ts', 'weather.model.ts'].map((f) =>
      readFileSync(join(root, f), 'utf8'),
    );
    for (const src of sources) {
      expect(src).not.toMatch(/localhost/);
      expect(src).not.toMatch(/:8080/);
    }
  });
});
