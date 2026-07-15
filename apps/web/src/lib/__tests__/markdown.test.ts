import { describe, it, expect } from "vitest";
import { escapeHtml, inlineMarkdownToHtml } from "../markdown";

describe("escapeHtml", () => {
  it("neutraliza los cinco caracteres peligrosos", () => {
    expect(escapeHtml(`<img src=x onerror="alert('xss')" & more>`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot; &amp; more&gt;"
    );
  });
});

describe("inlineMarkdownToHtml", () => {
  it("un <script> emitido por el LLM queda inerte (el vector del XSS original)", () => {
    const html = inlineMarkdownToHtml(`<script>alert("pwned")</script>`);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("un <img onerror> queda inerte", () => {
    const html = inlineMarkdownToHtml("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
  });

  it("conserva el subset soportado: negritas, viñetas y saltos", () => {
    expect(inlineMarkdownToHtml("**Ahorro**\n- meta 1")).toBe(
      "<strong>Ahorro</strong><br/>&bull; meta 1"
    );
  });

  it("las negritas no reintroducen HTML sin escapar", () => {
    expect(inlineMarkdownToHtml("**<b>x</b>**")).toBe("<strong>&lt;b&gt;x&lt;/b&gt;</strong>");
  });
});
