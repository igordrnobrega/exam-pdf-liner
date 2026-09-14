/**
 * Product events sent to the self-hosted Umami instance loaded in index.html.
 * Only counts and categories ever leave the browser: never a patient name, a
 * value or a line of the report. Everything is a no-op when the tracker is
 * blocked or absent (dev server, forks without Umami).
 */
type EventData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track: (event: string, data?: EventData) => void };
  }
}

export function track(event: 'pdf_processed' | 'pdf_failed' | 'copy', data: EventData = {}): void {
  try {
    window.umami?.track(event, data);
  } catch {
    // analytics must never break the app
  }
}
