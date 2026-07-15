import * as fs from "node:fs";

/**
 * Atribución de features por instancia para modelos XGBoost (`gbtree`), leyendo directamente
 * el dump nativo `xgb.json` (no el ONNX) — método de Saabas / "decision path attribution":
 * para cada árbol, sigue el camino de decisión real que toma el feature vector dado y le
 * atribuye a la feature de cada split el cambio en el valor esperado (promedio de hojas
 * ponderado por `sum_hessian`, equivalente al "cover" de entrenamiento) entre el nodo padre
 * y el hijo tomado.
 *
 * No es SHAP exacto (TreeSHAP): Saabas es dependiente del camino y no garantiza las
 * propiedades de "fair attribution" (eficiencia/simetría) de Shapley — puede ser sesgado en
 * árboles con splits muy desbalanceados. Es, sin embargo, una explicación real por instancia
 * (varía según los valores de cada usuario), a diferencia de `PDModelRegistry.getTopFeatures`,
 * que devuelve el ranking SHAP *global* del modelo (igual para todos los usuarios). Subir a
 * TreeSHAP exacto requeriría reimplementar el algoritmo recursivo EXTEND/UNWIND completo;
 * queda como mejora futura si se necesita la garantía de aditividad exacta de Shapley.
 */

type RawTree = {
  left_children: number[];
  right_children: number[];
  split_indices: number[];
  split_conditions: number[];
  default_left: number[];
  sum_hessian: number[];
};

type ParsedTree = {
  leftChildren: number[];
  rightChildren: number[];
  splitIndices: number[];
  splitConditions: number[];
  defaultLeft: number[];
  /** Valor esperado (promedio de hojas bajo el nodo, ponderado por sum_hessian), precomputado bottom-up. */
  nodeValue: number[];
};

export type InstanceExplanation = {
  /** margin (logit) total reconstruido = bias + sum(contributions); útil solo para sanity-check, no para mostrar al usuario. */
  marginTotal: number;
  bias: number;
  /** Contribución firmada por feature, en espacio logit. Signo positivo = empuja el riesgo hacia arriba. */
  contributions: Array<{ feature: string; contribution: number }>;
};

function parseTree(raw: RawTree): ParsedTree {
  const n = raw.left_children.length;
  const nodeValue = new Array<number>(n).fill(0);

  // Los umbrales de split y pesos de hoja son float32 en XGBoost, pero el JSON los serializa
  // con precisión insuficiente para features de gran magnitud (p.ej. totalDebits ~millones de
  // CLP): "2802980.2" parsea a un float64 distinto del float32 real (2802980.25). Math.fround
  // recupera el float32 correcto (el más cercano al float64 parseado), evitando que el camino
  // de decisión diverja del booster en valores cercanos al umbral.
  const splitConditions = raw.split_conditions.map((v) => Math.fround(v));

  // Bottom-up: los nodos están en orden BFS desde la raíz (índice 0), así que recorrer de
  // atrás hacia adelante garantiza que los hijos ya estén resueltos antes que el padre.
  for (let i = n - 1; i >= 0; i--) {
    const left = raw.left_children[i];
    const right = raw.right_children[i];
    if (left === -1) {
      // Hoja: split_conditions almacena el peso de la hoja en este slot.
      nodeValue[i] = splitConditions[i];
    } else {
      const hl = raw.sum_hessian[left] || 0;
      const hr = raw.sum_hessian[right] || 0;
      const total = hl + hr;
      nodeValue[i] = total > 0 ? (hl * nodeValue[left] + hr * nodeValue[right]) / total : 0;
    }
  }

  return {
    leftChildren: raw.left_children,
    rightChildren: raw.right_children,
    splitIndices: raw.split_indices,
    splitConditions,
    defaultLeft: raw.default_left,
    nodeValue,
  };
}

export class XgbTreeModel {
  private trees: ParsedTree[];
  private numFeatures: number;

  private constructor(trees: ParsedTree[], numFeatures: number) {
    this.trees = trees;
    this.numFeatures = numFeatures;
  }

  static loadFromFile(path: string): XgbTreeModel {
    const raw = JSON.parse(fs.readFileSync(path, "utf-8"));
    const learner = raw.learner;
    const rawTrees: RawTree[] = learner.gradient_booster.model.trees;
    const numFeatures = Number(
      learner.learner_model_param?.num_feature ?? rawTrees[0]?.left_children?.length ?? 0,
    );
    return new XgbTreeModel(rawTrees.map(parseTree), numFeatures);
  }

  get featureCount(): number {
    return this.numFeatures;
  }

  /**
   * Margin (logit) crudo = suma de los pesos de hoja alcanzados en cada árbol. Equivale a
   * `booster.predict(dmatrix, output_margin=True)` cuando `base_score=0.5` (logit 0, como en
   * train_xgb.py). Es el mismo total que `explain().marginTotal`, pero sin construir el
   * vector de contribuciones — la ruta caliente de scoring no las necesita.
   */
  margin(features: number[]): number {
    let total = 0;
    for (const tree of this.trees) {
      let node = 0;
      while (tree.leftChildren[node] !== -1) {
        const fIdx = tree.splitIndices[node];
        const x = features[fIdx];
        // XGBoost compara en float32 (DMatrix castea a float32); igualamos con Math.fround para
        // tomar exactamente el mismo camino cuando el valor cae justo sobre un umbral de split.
        const goLeft =
          x == null || Number.isNaN(x)
            ? tree.defaultLeft[node] === 1
            : Math.fround(x) < tree.splitConditions[node];
        node = goLeft ? tree.leftChildren[node] : tree.rightChildren[node];
      }
      total += tree.nodeValue[node]; // peso de la hoja alcanzada
    }
    return total;
  }

  /**
   * Probabilidad de la clase positiva (default) para `binary:logistic`: `sigmoid(margin)`.
   * Verificado contra la salida ONNX (`probabilities[1]`) a ~1e-7 — ver test de paridad.
   */
  predictProba(features: number[]): number {
    const m = this.margin(features);
    return 1 / (1 + Math.exp(-m));
  }

  /**
   * Atribución por instancia en espacio logit (margin). `features` debe estar en el mismo
   * orden que `feature_meta.json` (el mismo orden usado al entrenar, ver train_xgb.py).
   */
  explain(features: number[], featureNames: string[]): InstanceExplanation {
    const contributions = new Array<number>(this.numFeatures).fill(0);
    let bias = 0;

    for (const tree of this.trees) {
      bias += tree.nodeValue[0];
      let node = 0;
      while (tree.leftChildren[node] !== -1) {
        const fIdx = tree.splitIndices[node];
        const cond = tree.splitConditions[node];
        const x = features[fIdx];
        // Mismo criterio float32 que margin() — ver nota allí.
        const goLeft =
          x == null || Number.isNaN(x) ? tree.defaultLeft[node] === 1 : Math.fround(x) < cond;
        const child = goLeft ? tree.leftChildren[node] : tree.rightChildren[node];
        contributions[fIdx] += tree.nodeValue[child] - tree.nodeValue[node];
        node = child;
      }
    }

    return {
      marginTotal: bias + contributions.reduce((a, b) => a + b, 0),
      bias,
      contributions: featureNames.map((name, i) => ({
        feature: name,
        contribution: contributions[i] ?? 0,
      })),
    };
  }

  /** Top features por |contribución|, con signo (aumenta/reduce riesgo) para mostrar como "reasons". */
  topReasons(
    features: number[],
    featureNames: string[],
    limit = 5,
  ): Array<{
    feature: string;
    contribution: number;
    direction: "increases_risk" | "decreases_risk";
  }> {
    const { contributions } = this.explain(features, featureNames);
    return contributions
      .slice()
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, limit)
      .map((c) => ({
        ...c,
        direction: c.contribution >= 0 ? ("increases_risk" as const) : ("decreases_risk" as const),
      }));
  }
}
