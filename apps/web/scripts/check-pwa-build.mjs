#!/usr/bin/env node
/**
 * Static PWA smoke for the production build.
 *
 * Runs after `npm run build -w @coda/web` and guards the regressions fixed in
 * the PWA audit: a single Workbox SW with push handlers, no personal API cache,
 * and a small app-shell precache.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const distDir = join(appRoot, "dist");
const publicDir = join(appRoot, "public");

const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readText(relativePath) {
  const file = join(distDir, relativePath);
  assert(existsSync(file), `Missing dist/${relativePath}`);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function readJson(relativePath) {
  try {
    return JSON.parse(readText(relativePath));
  } catch (error) {
    fail(`Invalid JSON in dist/${relativePath}: ${error.message}`);
    return {};
  }
}

function distPathFromUrl(url) {
  return join(distDir, url.replace(/^\/+/, ""));
}

const html = readText("index.html");
const manifest = readJson("manifest.json");
const sw = readText("sw.js");

assert(!existsSync(join(publicDir, "sw.js")), "public/sw.js must not exist; Workbox injectManifest owns /sw.js");

assert(html.includes('<link rel="manifest" href="/manifest.json"'), "index.html must link /manifest.json");
assert(html.includes('name="theme-color" content="#FF5C35"'), "index.html theme-color must match orange brand");
assert(!html.includes("REPLACE_WITH_GSC_VERIFICATION_CODE"), "index.html contains the old GSC placeholder");
assert(!html.includes("vendor-charts"), "index.html must not preload vendor-charts");
assert(!html.includes("UniversalUploadDrawer"), "index.html must not preload UniversalUploadDrawer");

assert(manifest.name === "CODA", "manifest.name must be CODA");
assert(manifest.short_name === "CODA", "manifest.short_name must be CODA");
assert(manifest.start_url === "/", "manifest.start_url must be /");
assert(manifest.id === "/", "manifest.id must be /");
assert(manifest.scope === "/", "manifest.scope must be /");
assert(manifest.display === "standalone", "manifest.display must be standalone");
assert(manifest.theme_color === "#FF5C35", "manifest.theme_color must match orange brand");
assert(manifest.lang === "es-CL", "manifest.lang must be es-CL");
assert(Array.isArray(manifest.icons), "manifest.icons must be present");
assert(manifest.icons?.some((icon) => icon.sizes === "192x192"), "manifest must include a 192x192 icon");
assert(manifest.icons?.some((icon) => icon.sizes === "512x512"), "manifest must include a 512x512 icon");
assert(manifest.icons?.some((icon) => String(icon.purpose).includes("maskable")), "manifest must include a maskable icon");
assert(manifest.shortcuts?.some((shortcut) => shortcut.url === "/panel"), "manifest shortcut /panel missing");
assert(manifest.shortcuts?.some((shortcut) => shortcut.url === "/movimientos"), "manifest shortcut /movimientos missing");

for (const icon of manifest.icons || []) {
  assert(existsSync(distPathFromUrl(icon.src)), `manifest icon missing in dist: ${icon.src}`);
}

assert(sw.includes('self.addEventListener("push"'), "sw.js must include push handler");
assert(sw.includes('self.addEventListener("notificationclick"'), "sw.js must include notificationclick handler");
assert(sw.includes("showNotification"), "sw.js must show push notifications");
assert(sw.includes("openWindow"), "sw.js must handle notification click navigation");
assert(sw.includes("caches.delete") && sw.includes("api-cache"), "sw.js must purge legacy api-cache");
assert(!sw.includes("NetworkFirst"), "sw.js must not use NetworkFirst runtime cache");
assert(!sw.includes('cacheName:"api-cache"') && !sw.includes("cacheName:'api-cache'"), "sw.js must not recreate api-cache");
assert(!sw.includes("vendor-charts"), "sw.js must not precache vendor-charts");
assert(!sw.includes("UniversalUploadDrawer"), "sw.js must not precache UniversalUploadDrawer");

const precacheUrls = [...sw.matchAll(/"?url"?:"([^"]+)"/g)].map((match) => match[1]);
assert(precacheUrls.length > 0, "sw.js precache manifest is empty");
assert(precacheUrls.length <= 30, `sw.js precache has too many entries: ${precacheUrls.length}`);
assert(precacheUrls.includes("index.html"), "precache must include index.html");
assert(precacheUrls.includes("manifest.json"), "precache must include manifest.json");
assert(precacheUrls.includes("favicon.svg"), "precache must include favicon.svg");
assert(precacheUrls.some((url) => /^assets\/index-.*\.js$/.test(url)), "precache must include the app shell JS");
assert(precacheUrls.some((url) => /^assets\/index-.*\.css$/.test(url)), "precache must include the app shell CSS");
assert(precacheUrls.some((url) => /^assets\/vendor-react-.*\.js$/.test(url)), "precache must include vendor-react");
assert(precacheUrls.some((url) => /^assets\/workbox-window.*\.js$/.test(url)), "precache must include workbox-window");

const forbiddenPrecache = [/^api\//, /^screenshots\//, /^splash\//, /vendor-charts/, /UniversalUploadDrawer/];
for (const url of precacheUrls) {
  for (const pattern of forbiddenPrecache) {
    assert(!pattern.test(url), `forbidden precache entry: ${url}`);
  }
}

let precacheBytes = 0;
for (const url of precacheUrls) {
  const file = distPathFromUrl(url);
  if (existsSync(file)) {
    precacheBytes += statSync(file).size;
  } else {
    fail(`precache entry missing in dist: ${url}`);
  }
}

const maxPrecacheBytes = 1.2 * 1024 * 1024;
assert(
  precacheBytes <= maxPrecacheBytes,
  `precache too large: ${(precacheBytes / 1024).toFixed(1)} KiB > ${(maxPrecacheBytes / 1024).toFixed(0)} KiB`
);

if (errors.length) {
  console.error("[pwa-smoke] failed");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `[pwa-smoke] OK: ${precacheUrls.length} precache entries, ${(precacheBytes / 1024).toFixed(1)} KiB`
);
