import { InjectionToken } from '@angular/core';

/**
 * Base URL of the Spring Boot REST/SSE backend — the unchanged integration seam
 * (`/musiccategories` CRUD and `/weather/forecast` SSE on port 8080).
 *
 * The value is supplied by the `web` app (from environment config), never
 * hardcoded inside libraries. In local dev it is typically '' (empty string) so
 * requests go same-origin and are forwarded to :8080 by the dev proxy
 * (`frontend/apps/web/proxy.conf.json`), sidestepping CORS.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');
