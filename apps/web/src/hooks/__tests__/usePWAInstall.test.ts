import { describe, expect, it } from "vitest";
import { isAppleMobilePlatform, isStandalonePWA, isMobileLikeDevice } from "../usePWAInstall";

describe("isMobileLikeDevice (gate del banner PWA)", () => {
  const mm = (matches: boolean) => () => ({ matches }) as MediaQueryList;

  it("es true en Android por user agent", () => {
    expect(
      isMobileLikeDevice({
        navigator: {
          userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel)",
          platform: "Linux armv8l",
          maxTouchPoints: 5,
        },
        matchMedia: mm(false),
      }),
    ).toBe(true);
  });

  it("es true en iPhone", () => {
    expect(
      isMobileLikeDevice({
        navigator: {
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)",
          platform: "iPhone",
          maxTouchPoints: 5,
        },
        matchMedia: mm(false),
      }),
    ).toBe(true);
  });

  it("es FALSE en desktop con mouse (no muestra el banner)", () => {
    expect(
      isMobileLikeDevice({
        navigator: {
          userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Brave",
          platform: "Linux x86_64",
          maxTouchPoints: 0,
        },
        matchMedia: mm(false), // pointer: coarse → no
      }),
    ).toBe(false);
  });

  it("es true si el puntero primario es grueso (tablet/touch)", () => {
    expect(
      isMobileLikeDevice({
        navigator: { userAgent: "Mozilla/5.0 (X11; Linux)", platform: "Linux", maxTouchPoints: 5 },
        matchMedia: mm(true),
      }),
    ).toBe(true);
  });
});

describe("usePWAInstall platform detection", () => {
  it("detecta iPhone/iPad por user agent", () => {
    expect(
      isAppleMobilePlatform({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("detecta iPadOS moderno aunque reporte plataforma MacIntel", () => {
    expect(
      isAppleMobilePlatform({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("no marca macOS desktop como instalacion manual iOS", () => {
    expect(
      isAppleMobilePlatform({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126",
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });

  it("detecta standalone por media query o navigator.standalone", () => {
    expect(
      isStandalonePWA({
        navigator: { userAgent: "", platform: "", maxTouchPoints: 0, standalone: true },
        matchMedia: () => ({ matches: false }) as MediaQueryList,
      }),
    ).toBe(true);

    expect(
      isStandalonePWA({
        navigator: { userAgent: "", platform: "", maxTouchPoints: 0 },
        matchMedia: () => ({ matches: true }) as MediaQueryList,
      }),
    ).toBe(true);
  });
});
