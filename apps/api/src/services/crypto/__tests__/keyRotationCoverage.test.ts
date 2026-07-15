import { describe, it, expect } from "vitest";
import { ENCRYPTED_COLUMNS } from "../encryptedColumnsRegistry";
import { TABLES_BY_NAME, TARGETS } from "../keyRotation";

/**
 * Verifica que `keyRotation.ts` esté realmente wireado con cada entrada del registro
 * (`encryptedColumnsRegistry.ts`) — la fuente de verdad de qué se cifra con `encryptField` en
 * `storage.ts`. Esto es lo que habría fallado si `transactions` se hubiera vuelto a olvidar de
 * `TARGETS` (el bug original que esta refactorización cierra).
 *
 * No ejercita una rotación real end-to-end: `fieldEncryption.ts` deriva `prevKey` una sola vez al
 * importar el módulo desde `FIELD_ENCRYPTION_KEY_PREV`, que no está seteada en el proceso de test
 * (ver fieldEncryption.test.ts) — eso solo se puede probar corriendo el script
 * `db:rotate-encryption-key` con la env real seteada.
 */
describe("keyRotation coverage", () => {
  it("tiene una tabla real wireada para cada entrada del registro", () => {
    for (const { table } of ENCRYPTED_COLUMNS) {
      expect(TABLES_BY_NAME[table], `TABLES_BY_NAME falta la tabla "${table}"`).toBeDefined();
    }
  });

  it("cada columna del registro existe como columna real en su tabla Drizzle", () => {
    for (const { table, cols } of ENCRYPTED_COLUMNS) {
      const drizzleTable = TABLES_BY_NAME[table];
      for (const col of cols) {
        expect(drizzleTable[col], `${table}.${col} no existe en el schema`).toBeDefined();
      }
    }
  });

  it("TARGETS tiene exactamente una entrada por tabla del registro, con las mismas columnas", () => {
    expect(TARGETS).toHaveLength(ENCRYPTED_COLUMNS.length);
    for (const { table, cols } of ENCRYPTED_COLUMNS) {
      const target = TARGETS.find((t) => t.name === table);
      expect(target, `TARGETS no tiene entrada para "${table}"`).toBeDefined();
      expect(target!.cols.sort()).toEqual([...cols].sort());
    }
  });

  it("transactions está cubierto (regresión del bug: la tabla completa faltaba en TARGETS)", () => {
    const target = TARGETS.find((t) => t.name === "transactions");
    expect(target).toBeDefined();
    expect(target!.cols).toEqual(expect.arrayContaining(["description", "merchantName", "raw"]));
  });
});
