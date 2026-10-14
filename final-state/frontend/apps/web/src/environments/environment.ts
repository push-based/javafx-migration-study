/**
 * Web app environment config. `apiBaseUrl` is supplied to the `API_BASE_URL`
 * injection token (frontend/libs/shared/util) in app.config.ts.
 *
 * Empty string = same-origin: in dev the dev-server proxy (proxy.conf.json)
 * forwards the API paths to :8080, and the production build is served through
 * `server.mjs`, which does the same. The Spring servers therefore need no CORS
 * (see `docs/specs/music.md` §8, OD-6).
 */
export const environment = {
  production: false,
  apiBaseUrl: '',
};
