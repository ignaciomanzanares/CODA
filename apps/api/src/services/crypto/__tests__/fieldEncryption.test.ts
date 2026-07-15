import { describe, it, expect } from "vitest";
import {
  encryptField,
  decryptField,
  encryptFieldOrNull,
  decryptFieldOrNull,
  looksEncrypted,
  needsReencryption,
} from "../fieldEncryption";

describe("fieldEncryption", () => {
  it("round-trips a plaintext value", () => {
    const ciphertext = encryptField("12.345.678-9");
    expect(ciphertext).not.toBe("12.345.678-9");
    expect(decryptField(ciphertext)).toBe("12.345.678-9");
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encryptField("hello");
    const b = encryptField("hello");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe("hello");
    expect(decryptField(b)).toBe("hello");
  });

  it("handles null/undefined via *OrNull variants", () => {
    expect(encryptFieldOrNull(null)).toBeNull();
    expect(encryptFieldOrNull(undefined)).toBeNull();
    expect(decryptFieldOrNull(null)).toBeNull();
    const enc = encryptFieldOrNull("value");
    expect(enc).not.toBeNull();
    expect(decryptFieldOrNull(enc)).toBe("value");
  });

  it("rejects tampered ciphertext (auth tag mismatch)", () => {
    const ciphertext = encryptField("secret");
    const parts = ciphertext.split(":");
    const encryptedPayload = Buffer.from(parts[2], "base64");
    encryptedPayload[0] ^= 1;
    const tampered = [parts[0], parts[1], encryptedPayload.toString("base64")].join(":");
    expect(() => decryptField(tampered)).toThrow();
  });

  it("looksEncrypted distinguishes ciphertext from plaintext JSON", () => {
    expect(looksEncrypted(encryptField('{"a":1}'))).toBe(true);
    expect(looksEncrypted('{"a":1}')).toBe(false);
  });

  it("needsReencryption is false sin llave previa (valor autenticado por la actual)", () => {
    // Sin FIELD_ENCRYPTION_KEY_PREV (default en test), nada necesita re-cifrado: el valor
    // recién cifrado lo autentica la llave actual. La rotación con llave previa se ejercita
    // vía el script db:rotate-encryption-key (requiere env seteado al cargar el módulo).
    expect(needsReencryption(encryptField("x"))).toBe(false);
  });
});
