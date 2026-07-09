import { describe, expect, it } from "vitest";
import { isAppleMobilePlatform, isStandalonePWA } from "../usePWAInstall";

describe("usePWAInstall platform detection", () => {
  it("detecta iPhone/iPad por user agent", () => {
    expect(
      isAppleMobilePlatform({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
        platform: "iPhone",
        maxTouchPoints: 5,
      })
    ).toBe(true);
  });

  it("detecta iPadOS moderno aunque reporte plataforma MacIntel", () => {
    expect(
      isAppleMobilePlatform({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
      })
    ).toBe(true);
  });

  it("no marca macOS desktop como instalacion manual iOS", () => {
    expect(
      isAppleMobilePlatform({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126",
        platform: "MacIntel",
        maxTouchPoints: 0,
      })
    ).toBe(false);
  });

  it("detecta standalone por media query o navigator.standalone", () => {
    expect(
      isStandalonePWA({
        navigator: { userAgent: "", platform: "", maxTouchPoints: 0, standalone: true },
        matchMedia: () => ({ matches: false }) as MediaQueryList,
      })
    ).toBe(true);

    expect(
      isStandalonePWA({
        navigator: { userAgent: "", platform: "", maxTouchPoints: 0 },
        matchMedia: () => ({ matches: true }) as MediaQueryList,
      })
    ).toBe(true);
  });
});
