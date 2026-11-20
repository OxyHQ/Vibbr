/**
 * Routes that are full-screen, not a page under the app's bar: the door scanner owns the
 * whole screen, so the bar would sit on its controls.
 */
const FULL_SCREEN_ROUTES = ['/manage/scan'] as const;

export function hidesBottomBar(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return FULL_SCREEN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
