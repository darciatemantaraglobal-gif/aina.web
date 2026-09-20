/**
 * Where to land a user right after Google sign-in.
 *
 * AuthCallback always used to hardcode /dashboard, which is fine for the
 * normal login flow but wrong for a page like /trainer that has its own
 * Google button — signing in there and landing on /dashboard loses the
 * context of what the person was trying to do.
 *
 * The requesting page stores the path it wants to return to right before
 * calling signInWithOAuth; AuthCallback reads and clears it once the OAuth
 * round-trip completes. sessionStorage (not localStorage) so a stale value
 * never survives to a later, unrelated login in the same browser profile.
 */
const KEY = "aina_post_login_redirect";

export function setPostLoginRedirect(path: string): void {
  try { sessionStorage.setItem(KEY, path); } catch { /* storage unavailable — falls back to /dashboard */ }
}

export function consumePostLoginRedirect(): string {
  try {
    const path = sessionStorage.getItem(KEY);
    if (path) {
      sessionStorage.removeItem(KEY);
      return path;
    }
  } catch { /* storage unavailable */ }
  return "/dashboard";
}
