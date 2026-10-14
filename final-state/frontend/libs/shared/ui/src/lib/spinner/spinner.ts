import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Presentational loading spinner (shared/ui). The Angular home for the JavaFX
 * `ProgressIndicator` that the multi-thread Music client showed while a request
 * was in flight — now a brand-styled, accessible indicator a feature renders
 * inside its own `@if (loading()) { … }` (the `loading` signal replaces the
 * desktop `backgroundActive` counter; there is no artificial delay).
 *
 * Accessibility: the host is a polite live status region (`role="status"`,
 * `aria-live="polite"`) with an accessible name from `label` (visually shown
 * beside the animation). Purely presentational — no inputs beyond the label,
 * no service or router dependency.
 */
@Component({
  selector: 'lib-spinner',
  template: `
    <span class="spinner__dot" aria-hidden="true"></span>
    <span class="spinner__label">{{ label() }}</span>
  `,
  styleUrl: './spinner.scss',
  host: {
    class: 'spinner',
    role: 'status',
    'aria-live': 'polite',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Spinner {
  /** Accessible + visible status text shown beside the animation. */
  readonly label = input('Loading…');
}
