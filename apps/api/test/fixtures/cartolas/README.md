# Fixtures de cartolas — TODOS los datos personales son sintéticos

Los PDFs de `Santander/` se reconstruyeron a partir de cartolas reales
**reemplazando toda la PII** (titular, email, número de cuenta, nombres y
RUTs de contrapartes) por valores ficticios, preservando posición X/Y de
cada text-item (el parser clasifica columnas por coordenada) y la
estructura de montos/fechas para que la reconciliación de saldos siga
siendo real. Los `.txt` (incl. `tc-*.txt`) siguen la misma política.

Reglas si agregas un fixture nuevo:

1. **Nunca** commitear un documento real sin sanear. La PII queda en el
   historial de git para siempre.
2. Reemplazos de nombres con el MISMO largo palabra por palabra (los
   parsers y los `expected.json` dependen de las posiciones/columnas).
3. RUTs de terceros: rotar dígitos (no basta cambiar el dígito verificador).
4. Actualizar/regenerar el `.expected.json` y borrar los `.snapshot.json`
   correspondientes (el test los regenera).
