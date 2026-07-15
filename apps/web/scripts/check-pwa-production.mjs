#!/usr/bin/env node
/**
 * Production PWA smoke.
 *
 * Checks the deployed install surface over HTTP so Vercel rewrites/headers cannot
 * accidentally serve PWA assets as index.html.
 *
 * Usage:
 *   npm run test:pwa:prod -w @coda/web
 *   npm run test:pwa:prod -w @coda/web -- https://staging.example.com
 */

const baseUrl = (process.argv[2] || "https://codafinance.cl").replace(/\/+$/, "");
const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function absoluteUrl(pathOrUrl) {
  return new URL(pathOrUrl, `${baseUrl}/`).href;
}

async function fetchResponse(path, accept = "*/*") {
  const url = absoluteUrl(path);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { Accept: accept },
    });
    assert(res.ok, `${path} returned HTTP ${res.status}`);
    return res;
  } catch (error) {
    fail(`${path} failed to fetch: ${error.message}`);
    return null;
  }
}

async function fetchText(path, accept = "text/html,*/*") {
  const res = await fetchResponse(path, accept);
  if (!res) return { text: "", contentType: "", url: absoluteUrl(path) };
  return {
    text: await res.text(),
    contentType: res.headers.get("content-type") || "",
    url: res.url,
  };
}

async function fetchJson(path) {
  const { text, contentType, url } = await fetchText(path, "application/json,*/*");
  assert(
    /(?:application\/json|application\/manifest\+json)/i.test(contentType),
    `${path} must be JSON, got ${contentType || "no content-type"} from ${url}`,
  );
  assert(!text.trimStart().startsWith("<!DOCTYPE html>"), `${path} was served as HTML`);
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${path} is not valid JSON: ${error.message}`);
    return {};
  }
}

async function assertAsset(path, expectedType) {
  const res = await fetchResponse(path);
  if (!res) return;
  const contentType = res.headers.get("content-type") || "";
  assert(
    expectedType.test(contentType),
    `${path} expected ${expectedType}, got ${contentType || "no content-type"} from ${res.url}`,
  );
  const sample = await res.text();
  assert(!sample.trimStart().startsWith("<!DOCTYPE html>"), `${path} was served as HTML`);
}

function parseStartupImageHrefs(markup) {
  return [...markup.matchAll(/<link\b[^>]*rel="apple-touch-startup-image"[^>]*>/g)]
    .map((match) => match[0].match(/\bhref="([^"]+)"/)?.[1])
    .filter(Boolean);
}

const index = await fetchText("/", "text/html,*/*");
assert(
  /text\/html/i.test(index.contentType),
  `/ must be HTML, got ${index.contentType || "no content-type"}`,
);
assert(
  index.text.includes('<link rel="manifest" href="/manifest.json"'),
  "index must link /manifest.json",
);
assert(
  index.text.includes('name="theme-color" content="#FF5C35"'),
  "index theme-color must match orange brand",
);
assert(
  index.text.includes('name="apple-mobile-web-app-capable" content="yes"'),
  "index must enable iOS standalone mode",
);

const manifest = await fetchJson("/manifest.json");
assert(manifest.name === "CODA", "manifest.name must be CODA");
assert(manifest.short_name === "CODA", "manifest.short_name must be CODA");
assert(manifest.display === "standalone", "manifest.display must be standalone");
assert(manifest.theme_color === "#FF5C35", "manifest.theme_color must match orange brand");
assert(Array.isArray(manifest.icons), "manifest.icons must be present");
assert(Array.isArray(manifest.screenshots), "manifest.screenshots must be present");

const sw = await fetchText("/sw.js", "application/javascript,*/*");
assert(
  /javascript/i.test(sw.contentType),
  `/sw.js must be JavaScript, got ${sw.contentType || "no content-type"}`,
);
assert(sw.text.includes('self.addEventListener("push"'), "/sw.js must include push handler");
assert(
  sw.text.includes('self.addEventListener("notificationclick"'),
  "/sw.js must include notificationclick handler",
);
assert(!sw.text.includes("NetworkFirst"), "/sw.js must not runtime-cache API responses");
assert(
  !sw.text.includes('cacheName:"api-cache"') && !sw.text.includes("cacheName:'api-cache'"),
  "/sw.js must not recreate api-cache",
);

await assertAsset("/favicon.svg", /image\/svg\+xml/i);
await assertAsset("/og-image.png", /image\/png/i);
for (const icon of manifest.icons || []) {
  await assertAsset(icon.src, /image\/png/i);
}
for (const screenshot of manifest.screenshots || []) {
  await assertAsset(screenshot.src, /image\/png/i);
}

const startupImages = parseStartupImageHrefs(index.text);
assert(startupImages.length >= 12, `expected iOS startup images, found ${startupImages.length}`);
for (const href of startupImages) {
  await assertAsset(href, /image\/png/i);
}

if (errors.length) {
  console.error(`[pwa-prod-smoke] failed for ${baseUrl}`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[pwa-prod-smoke] OK: ${baseUrl}`);
