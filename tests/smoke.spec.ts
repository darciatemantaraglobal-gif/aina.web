// Pre-launch smoke tests (F3-2) — cover the routes that DON'T need a real
// Supabase session, so they run with zero credentials/secrets, in CI or
// locally. Real login/chat/payment flows need a live Supabase + OpenRouter
// project and a seeded test account, which this repo's test environment
// doesn't have; that gap is documented in migrations/README.md and the
// launch checklist rather than faked here.
//
// What these actually cover: "does the app still boot and render its
// public routes at all" — the category of regression a broken build, a
// routing change, or a component that throws on mount would produce,
// which is exactly the kind of silent breakage this audit kept finding
// elsewhere in the repo. Every page here renders <Navbar/>, which always
// shows the literal text "AINA" — so asserting that text is present is a
// simple, low-maintenance way to confirm the page tree actually mounted
// instead of falling back to GlobalErrorBoundary's error screen or a
// blank #root.
import { test, expect } from "../playwright-fixture";

test("landing page shows the AINA hero chat for a logged-out visitor", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/");
  await expect(page.getByText("AINA", { exact: false }).first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Selamat datang" })).toBeVisible();
});

for (const path of ["/features", "/pricing", "/about", "/terms", "/privacy", "/berita"]) {
  test(`${path} responds 200 and renders without a blank/crashed page`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    await expect(page.getByText("AINA", { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  });
}

test("an unknown route falls through to the 404 page instead of a blank screen", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist-aina");
  // The SPA catch-all (path="*") still serves index.html with a 200 —
  // routing to NotFound happens client-side, not via an HTTP 404.
  expect(response?.ok()).toBe(true);
  await expect(page.getByText("404")).toBeVisible();
  await expect(page.getByText("Oops! Page not found")).toBeVisible();
});
