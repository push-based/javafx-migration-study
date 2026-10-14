import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@web/shared-util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MusicCategory } from './music-category.model';
import { MusicCategoryService } from './music-category.service';

/**
 * Tests for `MusicCategoryService` — the REST client. Source of truth: the music
 * spec R1–R5 / AC1–AC5 (`docs/specs/music.md`). The seam is FROZEN (§4): these
 * assert method + URL + body per op, that POST is treated as **201**, and that
 * DELETE returns an **empty body** (void).
 *
 * Written before the implementation: each behavioral test first failed because
 * the behavior was missing, not because the test was malformed.
 */

const CLASSICAL: MusicCategory = { musicCategoryId: 1, musicCategory: 'Classical' };
const ROCK: MusicCategory = { musicCategoryId: 2, musicCategory: 'Rock' };

/** The HttpTestingController of the TestBed currently configured by setup(). */
let activeHttpMock: HttpTestingController | null = null;

/** Build the service with a given API_BASE_URL + HttpTestingController. */
function setup(base = '') {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: base },
    ],
  });
  const service = TestBed.inject(MusicCategoryService);
  const httpMock = TestBed.inject(HttpTestingController);
  activeHttpMock = httpMock;
  return { service, httpMock };
}

describe('MusicCategoryService (REST client)', () => {
  afterEach(() => {
    // Only the HTTP tests configure a TestBed/httpMock; the static source-scan
    // test does not, so guard the verify() to avoid a spurious NG0201.
    activeHttpMock?.verify();
    activeHttpMock = null;
    TestBed.resetTestingModule();
  });

  it('is provided in root and injectable', () => {
    const { service } = setup();
    expect(service).toBeInstanceOf(MusicCategoryService);
  });

  // --- R1 / AC1: list ------------------------------------------------------
  it('AC1 (R1): list() issues one GET to {base}/musiccategories and emits the array', () => {
    const { service, httpMock } = setup('');
    const received: MusicCategory[] = [];

    service.list().subscribe((cats: MusicCategory[]) => received.push(...cats));

    const req = httpMock.expectOne('/musiccategories');
    expect(req.request.method).toBe('GET');
    expect(req.request.body).toBeNull();

    req.flush([CLASSICAL, ROCK]);
    expect(received).toEqual([CLASSICAL, ROCK]);
  });

  // --- R2 / AC2: create — POST, no id, flush 201, emit saved entity ---------
  it('AC2 (R2): create(name) POSTs { musicCategory } with NO id', () => {
    const { service, httpMock } = setup('');

    service.create('Funk').subscribe();

    const req = httpMock.expectOne('/musiccategories');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ musicCategory: 'Funk' });
    // The id must NOT be sent — the server generates it.
    expect(
      (req.request.body as Record<string, unknown>)['musicCategoryId'],
    ).toBeUndefined();

    req.flush(
      { musicCategoryId: 9, musicCategory: 'Funk' },
      { status: 201, statusText: 'Created' },
    );
  });

  it('AC2 (R2): create() treats 201 as success and emits the saved entity with the generated id', () => {
    const { service, httpMock } = setup('');
    let saved: MusicCategory | undefined;

    service.create('Funk').subscribe((c: MusicCategory) => (saved = c));

    httpMock
      .expectOne('/musiccategories')
      .flush(
        { musicCategoryId: 9, musicCategory: 'Funk' },
        { status: 201, statusText: 'Created' },
      );

    expect(saved).toEqual({ musicCategoryId: 9, musicCategory: 'Funk' });
  });

  // --- R3 / AC3: update — PUT to /{id} with full body ----------------------
  it('AC3 (R3): update(category) PUTs the full body to {base}/musiccategories/{id}', () => {
    const { service, httpMock } = setup('');
    const edited: MusicCategory = { musicCategoryId: 3, musicCategory: 'Fusion' };
    let updated: MusicCategory | undefined;

    service.update(edited).subscribe((c: MusicCategory) => (updated = c));

    const req = httpMock.expectOne('/musiccategories/3');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(edited);

    req.flush(edited);
    expect(updated).toEqual(edited);
  });

  // --- R4 / AC4: delete — DELETE /{id}, empty body, completes with no value -
  it('AC4 (R4): remove(id) issues DELETE {base}/musiccategories/{id}', () => {
    const { service, httpMock } = setup('');

    service.remove(3).subscribe();

    const req = httpMock.expectOne('/musiccategories/3');
    expect(req.request.method).toBe('DELETE');

    req.flush(null, { status: 200, statusText: 'OK' });
  });

  it('AC4 (R4): remove() flushing 200 with an empty body completes with no emitted value', () => {
    const { service, httpMock } = setup('');
    const next = jest.fn();
    const complete = jest.fn();

    service.remove(3).subscribe({ next, complete });

    // Empty body — the seam returns 200 with no payload (bodyToMono(Void)).
    httpMock
      .expectOne('/musiccategories/3')
      .flush(null, { status: 200, statusText: 'OK' });

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(null);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  // --- R5 / AC5: base URL from the token, never hardcoded ------------------
  it('AC5 (R5): every request URL is built from API_BASE_URL', () => {
    const { service, httpMock } = setup('http://example.test');

    service.list().subscribe();
    httpMock.expectOne('http://example.test/musiccategories').flush([]);

    service.update({ musicCategoryId: 7, musicCategory: 'Soul' }).subscribe();
    httpMock
      .expectOne('http://example.test/musiccategories/7')
      .flush({ musicCategoryId: 7, musicCategory: 'Soul' });

    service.remove(7).subscribe();
    httpMock
      .expectOne('http://example.test/musiccategories/7')
      .flush(null, { status: 200, statusText: 'OK' });
  });

  it('AC5 (R5): the lib source contains no hardcoded localhost / :8080 literal', () => {
    const root = join(__dirname);
    const sources = ['music-category.service.ts', 'music-category.model.ts'].map(
      (f) => readFileSync(join(root, f), 'utf8'),
    );
    for (const src of sources) {
      expect(src).not.toMatch(/localhost/);
      expect(src).not.toMatch(/:8080/);
    }
  });
});
