import { describe, expect, it } from "vitest";
import { isBrowserOffline } from "../networkStatus";

describe("networkStatus", () => {
  it("detecta offline cuando navigator.onLine es false", () => {
    expect(isBrowserOffline({ onLine: false })).toBe(true);
  });

  it("detecta online cuando navigator.onLine es true", () => {
    expect(isBrowserOffline({ onLine: true })).toBe(false);
  });

  it("asume online cuando no existe navigator", () => {
    expect(isBrowserOffline(undefined)).toBe(false);
  });
});
