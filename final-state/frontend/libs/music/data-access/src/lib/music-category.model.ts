/**
 * The CRUD payload shapes carried over the `/musiccategories` REST seam.
 *
 * Frozen seam (do not change — `docs/specs/music.md` §4, verified from
 * `backend/rest-h2` `domain/MusicCategory.java`): the entity's JSON keys are
 * exactly `musicCategoryId` / `musicCategory` (no `@JsonProperty` renaming).
 */

/** A persisted music category as returned by the server (carries its id). */
export interface MusicCategory {
  musicCategoryId: number;
  musicCategory: string;
}

/**
 * The create payload — POST sends **no id** (the server generates it, R2). A
 * distinct type makes "no id on create" a compile-time guarantee rather than a
 * convention.
 */
export type NewMusicCategory = { musicCategory: string };
