import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
  httpMetricsMiddleware,
  initObservability,
  metrics,
  registerMetricsEndpoint,
  sanitizeForObservability,
} from "../index.js";

const originalEnv = { ...process.env };

afterEach(() => {
  metrics.reset();
  process.env = { ...originalEnv };
});

async function request(app: express.Express, path: string, init: RequestInit = {}) {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
    const text = await response.text();
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      text,
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function testApp() {
  const app = express();
  app.use(httpMetricsMiddleware);
  registerMetricsEndpoint(app);
  app.get("/api/users/:id", (_req, res) => res.json({ ok: true }));
  app.get("/api/fail/:id", (_req, res) => res.status(503).json({ ok: false }));
  return app;
}

describe("observability metrics", () => {
  it("increments request metrics and normalizes route labels", async () => {
    process.env.METRICS_ENABLED = "true";
    process.env.METRICS_TOKEN = "test-token";
    const app = testApp();

    await request(app, "/api/users/123?email=person@example.com&token=secret");
    const response = await request(app, "/metrics", {
      headers: { authorization: "Bearer test-token" },
    });

    expect(response.status).toBe(200);
    expect(response.contentType).toContain("text/plain");
    expect(response.text).toContain('coda_http_requests_total{method="GET",route="/api/users/:id",status="200"} 1');
    expect(response.text).toContain('coda_http_request_duration_ms{method="GET",route="/api/users/:id"}');
    expect(response.text).not.toContain("person@example.com");
    expect(response.text).not.toContain("token=secret");
    expect(response.text).not.toContain("/api/users/123");
  });

  it("counts HTTP 5xx responses", async () => {
    process.env.METRICS_ENABLED = "true";
    process.env.METRICS_TOKEN = "test-token";
    const app = testApp();

    await request(app, "/api/fail/abc123");
    const response = await request(app, "/metrics", {
      headers: { "x-metrics-token": "test-token" },
    });

    expect(response.status).toBe(200);
    expect(response.text).toContain('coda_http_errors_total{route="/api/fail/:id",status="503"} 1');
  });
});

describe("/metrics protection", () => {
  it("is disabled by default in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.METRICS_ENABLED;
    delete process.env.METRICS_TOKEN;

    const response = await request(testApp(), "/metrics");

    expect(response.status).toBe(404);
  });

  it("does not expose metrics in production without METRICS_TOKEN", async () => {
    process.env.NODE_ENV = "production";
    process.env.METRICS_ENABLED = "true";
    delete process.env.METRICS_TOKEN;

    const response = await request(testApp(), "/metrics");

    expect(response.status).toBe(404);
  });

  it("requires a valid token when metrics are enabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.METRICS_ENABLED = "true";
    process.env.METRICS_TOKEN = "expected";

    const missing = await request(testApp(), "/metrics");
    const invalidSameLength = await request(testApp(), "/metrics", {
      headers: { authorization: "Bearer notright" }, // mismo largo (8) que "expected"
    });
    const valid = await request(testApp(), "/metrics", {
      headers: { authorization: "Bearer expected" },
    });

    expect(missing.status).toBe(401);
    expect(invalidSameLength.status).toBe(401);
    expect(valid.status).toBe(200);
    expect(valid.text).toContain("coda_process_uptime_seconds");
  });

  it("rejects a wrong-length token without throwing (timing-safe compare)", async () => {
    process.env.NODE_ENV = "production";
    process.env.METRICS_ENABLED = "true";
    process.env.METRICS_TOKEN = "expected";

    // Token de largo distinto: timingSafeEqual lanzaría si no se iguala el largo;
    // debe responder 401 limpio, no 500.
    const shorter = await request(testApp(), "/metrics", {
      headers: { authorization: "Bearer no" },
    });
    const longer = await request(testApp(), "/metrics", {
      headers: { "x-metrics-token": "expected-but-much-longer" },
    });

    expect(shorter.status).toBe(401);
    expect(longer.status).toBe(401);
  });
});

describe("observability redaction", () => {
  it("redacts sensitive strings and keys", () => {
    const sanitized = sanitizeForObservability({
      email: "person@example.com",
      message: "User person@example.com RUT 12.345.678-5 token=abc123",
      headers: {
        Authorization: "Bearer secret-token",
        Cookie: "sid=secret",
      },
      password: "secret-password",
      nested: {
        filename: "cartola-real.pdf",
        safe: "GET /api/users/123",
      },
    });

    const text = JSON.stringify(sanitized);
    expect(text).not.toContain("person@example.com");
    expect(text).not.toContain("12.345.678-5");
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("secret-password");
    expect(text).not.toContain("cartola-real.pdf");
    expect(text).toContain("[REDACTED");
  });

  it("does not fail when SENTRY_DSN is absent", () => {
    delete process.env.SENTRY_DSN;
    expect(() => initObservability()).not.toThrow();
  });
});
