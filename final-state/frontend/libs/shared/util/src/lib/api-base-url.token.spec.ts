import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from './api-base-url.token';

describe('API_BASE_URL token', () => {
  it('is injectable and yields the provided base URL', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: API_BASE_URL, useValue: 'http://example.test' }],
    });
    expect(TestBed.inject(API_BASE_URL)).toBe('http://example.test');
  });

  it('yields an empty string when configured for same-origin (dev proxy)', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: API_BASE_URL, useValue: '' }],
    });
    expect(TestBed.inject(API_BASE_URL)).toBe('');
  });
});
