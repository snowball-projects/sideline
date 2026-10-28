import { test, expect } from "@playwright/test";

test("home-screen assets load under the app path without CSP violations", async ({ page }) => {
  // Mount the real built output below a Pages-style subpath.
  await page.route("**/sideline/**", async (route) => {
    const url = new URL(route.request().url());
    url.pathname = url.pathname.replace(/^\/sideline\//, "/");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.cspViolations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  });
  const cspErrors = [];
  page.on("console", (message) => {
    if (/content security policy|refused to load/i.test(message.text())) cspErrors.push(message.text());
  });
  await page.goto("/sideline/");
  const session = await page.context().newCDPSession(page);
  const loaded = await session.send("Page.getAppManifest");
  expect(loaded.errors).toEqual([]);
  expect(new URL(loaded.url).pathname).toBe("/sideline/manifest.json");
  expect(JSON.parse(loaded.data).display).toBe("standalone");

  const icons = await page.evaluate(async () => {
    const manifest = await fetch(document.querySelector('link[rel="manifest"]').href).then((response) => response.json());
    const manifestUrl = document.querySelector('link[rel="manifest"]').href;
    const urls = [
      document.querySelector('link[rel="apple-touch-icon"]').href,
      ...manifest.icons.map((icon) => new URL(icon.src, manifestUrl).href),
    ];
    return Promise.all(urls.map(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { path: new URL(url).pathname, width: image.naturalWidth, height: image.naturalHeight };
    }));
  });
  expect(icons).toEqual([
    { path: "/sideline/apple-touch-icon.png", width: 180, height: 180 },
    { path: "/sideline/icon-192.png", width: 192, height: 192 },
    { path: "/sideline/icon-512.png", width: 512, height: 512 },
  ]);
  expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
  expect(cspErrors).toEqual([]);
});
