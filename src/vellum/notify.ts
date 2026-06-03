/**
 * notify.ts — browser notification for long-running generations.
 *
 * Fires ONLY when the user has switched away from the tab (document.hidden) so
 * it never interrupts someone actively watching the render. Graceful no-op when
 * the Notification API is unsupported or permission was denied.
 */

export function requestNotifyPermission(): void {
  try {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      void Promise.resolve(Notification.requestPermission()).catch(() => {});
    }
  } catch {
    /* ignore — notifications are a nicety, never block the app */
  }
}

export function notifyDone(title: string, body: string): void {
  try {
    if (
      typeof Notification === "undefined" ||
      Notification.permission !== "granted" ||
      typeof document === "undefined" ||
      !document.hidden // only ping if they've switched away
    ) {
      return;
    }
    const n = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "studioai-render", // coalesce so a batch doesn't stack notifications
    });
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* ignore */
  }
}
