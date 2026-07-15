/**
 * Clasificador incremental de categorías de transacción (#31).
 *
 * Aprende de las correcciones del usuario (`transaction_category_corrections`) un modelo
 * Multinomial Naive Bayes sobre tokens del texto del movimiento (TF + suavizado de Laplace).
 * Es "incremental": cada corrección nueva actualiza el modelo en memoria (`learn`), y el modelo
 * se reconstruye desde la tabla al boot/refresh. Sirve predicciones con una confianza; cuando no
 * está entrenado o la confianza es baja, devuelve `null` y el caller cae a las reglas regex
 * actuales (`categorizeTransaction`) — las reglas son el fallback, el clasificador el override.
 *
 * Se sirve como segundo modelo de la plataforma del Frente C: artefacto reproducible desde datos
 * versionados (la tabla de correcciones), con fallback determinístico.
 */
import { db, transactionCategoryCorrections } from "../../db/index.js";
import { mlLogger as logger } from "../../logger.js";
import { getBlobStore } from "../storage/blobStore.js";

/** Mínimo de ejemplos para que el clasificador opere (debajo de esto, siempre fallback). */
const MIN_EXAMPLES = 5;
/** Confianza mínima (posterior de la clase top) para usar la predicción en vez del fallback. */
const MIN_CONFIDENCE = 0.6;

const BLOB_KEY = "category_classifier_model_v1";

export function tokenize(text: string): string[] {
  return (
    text
      .toUpperCase()
      // NFD separa "Á" en "A" + marca de acento; quitamos la marca con '' (no con espacio, que
      // partiría la palabra) y luego colapsamos el resto del ruido a espacios. Así "FARMÀCIA"
      // tokeniza como "FARMACIA", no "FARMA CIA".
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^A-Z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && t.length <= 24)
  );
}

class CategoryClassifier {
  private classDocs = new Map<string, number>();
  private tokenCounts = new Map<string, Map<string, number>>();
  private classTotalTokens = new Map<string, number>();
  private vocab = new Set<string>();
  private totalDocs = 0;
  private loaded = false;

  reset(): void {
    this.classDocs.clear();
    this.tokenCounts.clear();
    this.classTotalTokens.clear();
    this.vocab.clear();
    this.totalDocs = 0;
    this.loaded = false;
  }

  /** Incorpora un ejemplo (texto → categoría) al modelo en memoria. */
  learn(text: string, category: string): void {
    const tokens = tokenize(text);
    if (tokens.length === 0) return;
    this.classDocs.set(category, (this.classDocs.get(category) ?? 0) + 1);
    this.totalDocs += 1;
    let perClass = this.tokenCounts.get(category);
    if (!perClass) {
      perClass = new Map();
      this.tokenCounts.set(category, perClass);
    }
    for (const tok of tokens) {
      perClass.set(tok, (perClass.get(tok) ?? 0) + 1);
      this.classTotalTokens.set(category, (this.classTotalTokens.get(category) ?? 0) + 1);
      this.vocab.add(tok);
    }
  }

  /** Serializa el estado del modelo a JSON para persistencia. */
  serialize(): string {
    return JSON.stringify({
      classDocs: Object.fromEntries(this.classDocs),
      tokenCounts: Object.fromEntries(
        Array.from(this.tokenCounts.entries()).map(([cls, m]) => [cls, Object.fromEntries(m)]),
      ),
      classTotalTokens: Object.fromEntries(this.classTotalTokens),
      vocab: Array.from(this.vocab),
      totalDocs: this.totalDocs,
    });
  }

  /** Restaura el estado del modelo desde JSON serializado. */
  deserialize(json: string): void {
    const s = JSON.parse(json);
    this.classDocs = new Map(Object.entries(s.classDocs));
    this.tokenCounts = new Map(
      Object.entries(s.tokenCounts).map(([cls, m]) => [
        cls,
        new Map(Object.entries(m as Record<string, number>)),
      ]),
    );
    this.classTotalTokens = new Map(Object.entries(s.classTotalTokens));
    this.vocab = new Set(s.vocab);
    this.totalDocs = s.totalDocs;
    this.loaded = true;
  }

  /** Persiste el modelo en blob store (fire-and-forget, no bloquea). */
  private async saveToBlob(): Promise<void> {
    try {
      const store = getBlobStore();
      const json = this.serialize();
      await store.putObject(BLOB_KEY, Buffer.from(json, "utf8"), {
        contentType: "application/json",
      });
    } catch (e) {
      logger.warn({ err: e }, "[categoryClassifier] no se pudo persistir el modelo en blob store");
    }
  }

  /** (Re)construye el modelo: primero intenta blob store, luego tabla de correcciones. */
  async load(): Promise<void> {
    // Intentar cargar desde blob store (modelo previamente serializado)
    try {
      const store = getBlobStore();
      const existing = await store.getObject(BLOB_KEY);
      if (existing) {
        this.deserialize(existing.toString("utf8"));
        logger.info(
          { examples: this.totalDocs, classes: this.classDocs.size },
          "[categoryClassifier] modelo restaurado desde blob",
        );
        return;
      }
    } catch {
      // blob store no disponible o sin modelo previo — reconstruir desde DB
    }

    try {
      this.reset();
      const rows = (await db
        .select({
          normalizedText: transactionCategoryCorrections.normalizedText,
          correctedCategory: transactionCategoryCorrections.correctedCategory,
        })
        .from(transactionCategoryCorrections)) as Array<{
        normalizedText: string;
        correctedCategory: string;
      }>;
      for (const r of rows) this.learn(r.normalizedText, r.correctedCategory);
      this.loaded = true;
      logger.info(
        { examples: this.totalDocs, classes: this.classDocs.size },
        "[categoryClassifier] modelo cargado desde DB",
      );
      // Persistir para próximos arranques
      if (this.totalDocs >= MIN_EXAMPLES) void this.saveToBlob();
    } catch (e) {
      // Tabla ausente (migración no corrida) u otro fallo → clasificador inactivo, solo fallback.
      this.loaded = true;
      logger.warn(
        { err: e },
        "[categoryClassifier] no se pudo cargar (se usará solo el fallback de reglas)",
      );
    }
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load();
  }

  /** Incorpora un ejemplo y actualiza el blob store si hay suficientes datos. */
  learnAndPersist(text: string, category: string): void {
    this.learn(text, category);
    if (this.totalDocs >= MIN_EXAMPLES && this.totalDocs % 10 === 0) {
      void this.saveToBlob();
    }
  }

  /** Predicción síncrona (requiere ensureLoaded previo). null = sin confianza → usar fallback. */
  predict(text: string): { category: string; confidence: number } | null {
    if (this.totalDocs < MIN_EXAMPLES || this.classDocs.size === 0) return null;
    const tokens = tokenize(text);
    if (tokens.length === 0) return null;

    const vocabSize = this.vocab.size || 1;
    const logScores: Array<{ category: string; logScore: number }> = [];
    for (const [category, docCount] of this.classDocs) {
      let logScore = Math.log(docCount / this.totalDocs); // log P(clase)
      const perClass = this.tokenCounts.get(category)!;
      const denom = (this.classTotalTokens.get(category) ?? 0) + vocabSize;
      for (const tok of tokens) {
        const count = perClass.get(tok) ?? 0;
        logScore += Math.log((count + 1) / denom); // log P(token|clase), Laplace
      }
      logScores.push({ category, logScore });
    }

    // Softmax sobre log-scores → posterior; el de la clase top es la confianza.
    const max = Math.max(...logScores.map((s) => s.logScore));
    let sum = 0;
    for (const s of logScores) sum += Math.exp(s.logScore - max);
    let best = logScores[0];
    for (const s of logScores) if (s.logScore > best.logScore) best = s;
    const confidence = Math.exp(best.logScore - max) / (sum || 1);

    if (confidence < MIN_CONFIDENCE) return null;
    return { category: best.category, confidence };
  }
}

export const categoryClassifier = new CategoryClassifier();

/** Predicción con fallback: si el clasificador no tiene confianza, usa `ruleFallback`. */
export function classifyOrRule(text: string, ruleFallback: string): string {
  const pred = categoryClassifier.predict(text);
  return pred ? pred.category : ruleFallback;
}
