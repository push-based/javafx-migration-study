import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '@web/shared-util';
import { Observable } from 'rxjs';
import { MusicCategory, NewMusicCategory } from './music-category.model';

/**
 * REST client for `/musiccategories` — the Angular replacement for the JavaFX
 * `MusicRESTService` (`WebClient.…block()`). The two desktop clients
 * (`SpringBootWebClientFX`, `SpringBootClientFXMultiThread`) collapse onto this
 * one async service (`docs/specs/music.md` §1.1, §3).
 *
 * Contract (encoded by `music-category.service.spec.ts`):
 *  - `list()`       → `GET    {base}/musiccategories`               → `MusicCategory[]` (R1).
 *  - `create(name)` → `POST   {base}/musiccategories` body `{ musicCategory }`,
 *    **no id**; server replies **201** with the saved entity (id present)        (R2).
 *  - `update(c)`    → `PUT    {base}/musiccategories/{id}` full body              (R3).
 *  - `remove(id)`   → `DELETE {base}/musiccategories/{id}` → empty body / void    (R4).
 *
 * `base` is the injected `API_BASE_URL` token — no backend host literal appears
 * anywhere in this lib (R5). `getOne` is omitted (OD-2): the UI never calls
 * `GET /{id}` and the original JavaFX path was dead code.
 */
@Injectable({ providedIn: 'root' })
export class MusicCategoryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** The collection endpoint, rooted at the injected base URL (R5). */
  private get collectionUrl(): string {
    return `${this.baseUrl}/musiccategories`;
  }

  /** R1 — GET the full list of categories. */
  list(): Observable<MusicCategory[]> {
    return this.http.get<MusicCategory[]>(this.collectionUrl);
  }

  /**
   * R2 — POST a new category. Sends only the name (`{ musicCategory }`, no id —
   * the server generates it) and returns the saved entity carrying its id. The
   * seam replies 201 Created, which `HttpClient` treats as success.
   */
  create(name: string): Observable<MusicCategory> {
    const payload: NewMusicCategory = { musicCategory: name };
    return this.http.post<MusicCategory>(this.collectionUrl, payload);
  }

  /**
   * R3 — PUT the full category to `/{id}`; returns the updated entity. The seam
   * forces the id from the path, so the body's id is authoritative here.
   */
  update(category: MusicCategory): Observable<MusicCategory> {
    return this.http.put<MusicCategory>(
      `${this.collectionUrl}/${category.musicCategoryId}`,
      category,
    );
  }

  /** R4 — DELETE `/{id}`; completes with no value (empty body). */
  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.collectionUrl}/${id}`);
  }
}
