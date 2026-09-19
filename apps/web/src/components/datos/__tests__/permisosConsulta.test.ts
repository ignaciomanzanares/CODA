import { describe, it, expect } from "vitest";
import { nombreExpediente } from "../PermisosConsulta";

/**
 * El expediente se descarga con la fecha en el nombre para poder archivar varias copias sin
 * sobrescribirlas — y sin confiar en que el backend siempre mande un timestamp usable.
 */
describe("nombreExpediente", () => {
  it("usa la fecha del expediente", () => {
    expect(nombreExpediente("2026-09-18T20:00:00.000Z")).toBe(
      "consentimientos-coda-2026-09-18.json",
    );
  });

  it("con un timestamp inservible no arma un nombre roto", () => {
    expect(nombreExpediente("")).toBe("consentimientos-coda-sin-fecha.json");
    expect(nombreExpediente("undefined")).toBe("consentimientos-coda-sin-fecha.json");
  });
});
