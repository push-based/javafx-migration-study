/**
 * Web app environment config. `apiBaseUrl` is supplied to the `API_BASE_URL`
 * injection token (frontend/libs/shared/util) in app.config.ts.
 *
 * Empty string = same-origin: in dev the dev-server proxy (proxy.conf.json)
 * forwards `/musiccategories` and `/weather` to :8080, sidestepping CORS. A
 * deployed build that targets a different origin would set a real URL here (and
 * the Spring servers would then need CORS) — deferred until a hosting decision
 * (see `docs/specs/music.md` §8, OD-6).
 */
export const environment = {
  production: false,
  apiBaseUrl: '',
};
