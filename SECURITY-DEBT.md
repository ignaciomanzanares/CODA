# Security Debt

Last updated: 2026-04-22
Baseline after `npm audit fix` (non-breaking): **11 vulnerabilities (6 moderate, 5 high)**

The items below cannot be fixed with `npm audit fix` — they require `--force`
(breaking semver) or are blocked by a transitive dependency chain we do not
own. Each entry documents the CVE, the package, why it can't be fixed, and the
actual risk to production.

---

## HIGH — serialize-javascript (via vite-plugin-pwa)

**CVEs**
- GHSA-5c6j-r48x-rmvq — RCE via `RegExp.flags` and `Date.prototype.toISOString()`
- GHSA-qj8w-gfj5-8c6v — CPU exhaustion DoS via crafted array-like objects

**Dependency chain**
```
vite-plugin-pwa → workbox-build → @rollup/plugin-terser → serialize-javascript
```

**Why it can't be fixed**
`vite-plugin-pwa@0.21.x` pins `workbox-build >=7.1.0` which pulls an old
`@rollup/plugin-terser`. Upgrading `vite-plugin-pwa` to a version that uses a
patched chain requires Vite 6, which is a major breaking upgrade for the whole
build. `npm audit fix --force` attempts this and breaks the build.

**Actual risk: LOW**
`serialize-javascript` is used only at **build time** (by Rollup/Terser when
bundling the service worker). It never runs in production or in the browser.
An attacker would need to inject a crafted value into the build pipeline input —
not possible through a normal web request.

**Remediation path**
Upgrade `vite-plugin-pwa` to the latest version supporting Vite 6 when the team
upgrades to Vite 6. Track: https://github.com/vite-pwa/vite-plugin-pwa/releases

---

## HIGH — drizzle-orm (SQL injection via identifier escaping)

**CVE**: GHSA-gpj5-g38j-94v9

**Dependency chain**
```
apps/api → @coda/db → drizzle-orm
packages/db → drizzle-orm
```

**Why it can't be fixed**
The fix exists in a later minor of `drizzle-orm`, but `npm audit fix --force`
downgrades the package in a way that breaks the ORM schema type exports used
throughout the API. Needs a manual upgrade with migration testing.

**Actual risk: MEDIUM**
The vulnerability requires passing **unsanitized user input directly to
`sql` template-literal identifier slots** — a code path that exists in drizzle-orm
but is not exercised by any current CODA query. All table/column references in
`apps/api` are hardcoded string literals, not user-controlled. Risk is real but
not actively exploitable in the current codebase.

**Remediation path**
Upgrade `drizzle-orm` to the patched version (`>=0.31.4`) manually with a
dedicated PR, run the full test suite, and verify schema types still compile.
Target: next backend sprint.

---

## MODERATE — esbuild (SSRF/path traversal in dev server)

**CVEs**: Multiple (dev server only)

**Dependency chain**
```
drizzle-kit → @esbuild-kit/core-utils → esbuild
vite → esbuild
```

**Why it can't be fixed**
Patched esbuild versions are available but the transitive pinning in `drizzle-kit`
and the current `vite` version prevent a clean upgrade.

**Actual risk: NEGLIGIBLE**
The esbuild vulnerabilities affect the **development server** (SSRF via crafted
requests to the local dev server's proxy). The production build uses esbuild only
as a transpiler/bundler — the vulnerable dev-server code paths are never executed
in CI or production.

---

## MODERATE — nodemailer (SMTP command injection)

**CVE**: GHSA-vvjj-xcjg-gr5g — CRLF injection via `transportName` EHLO/HELO

**Dependency chain**
```
apps/api → nodemailer
```

**Why it can't be fixed**
The patched version (`>=6.9.14`) is available but `npm audit fix --force` applies
it with an incompatible API surface change that breaks the email sending module.
Needs a targeted manual upgrade.

**Actual risk: LOW**
The `transportName` option affected by this CVE is not set dynamically from
user input in the CODA API — it uses a hardcoded SMTP config. The injection
requires attacker control of the transport name.

**Remediation path**
Upgrade `nodemailer` to `>=6.9.14` manually in `apps/api/package.json`.

---

## Summary table

| Severity | CVE / Advisory | Package | Runtime? | Remediation |
|----------|---------------|---------|----------|-------------|
| HIGH | GHSA-5c6j-r48x-rmvq | serialize-javascript | Build-time only | Vite 6 upgrade |
| HIGH | GHSA-qj8w-gfj5-8c6v | serialize-javascript | Build-time only | Vite 6 upgrade |
| HIGH | GHSA-gpj5-g38j-94v9 | drizzle-orm | Runtime | Manual ORM upgrade PR |
| MODERATE | Multiple | esbuild | Dev-only | Track vite/drizzle-kit upgrades |
| MODERATE | GHSA-vvjj-xcjg-gr5g | nodemailer | Runtime | Manual `nodemailer` upgrade PR |
