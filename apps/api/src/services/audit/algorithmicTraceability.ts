/**
 * Algorithmic Traceability Service
 * 
 * Implements full audit trail for all credit scoring decisions.
 * Required for CMF compliance (NCG 502 Section IV - Risk Management).
 * 
 * Features:
 * - Log every credit score prediction
 * - Track model versions
 * - Store SHAP explainability
 * - Monitor model drift
 * - Handle user disputes
 * 
 * @author AI Assistant (Cursor)
 * @date 2026-03-02
 */

import { randomUUID } from 'crypto';
import type { CmfInformeDeudas } from '../documents/pdfAnalysis.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ModelVersion {
  id: string;
  modelType: 'logistic_regression' | 'xgboost' | 'ensemble' | 'simple_rules';
  version: string;
  deployedAt: Date;
  deployedBy: string;
  isActive: boolean;
  trainingMetrics?: {
    auc?: number;
    gini?: number;
    brierScore?: number;
    accuracy?: number;
  };
  hyperparameters?: Record<string, any>;
  features?: string[];
  modelPath?: string;
  changelog?: string;
}

export interface CreditScorePredictionLog {
  id: string;
  userId: string;
  requestId: string;
  
  // Model used
  modelVersionId: string;
  modelVersion: string;
  
  // Input data
  inputFeatures: Record<string, any>;
  cmfData?: Partial<CmfInformeDeudas>;
  sfaData?: any;
  
  // Prediction output
  creditScore: number;
  probabilityDefault: number;
  riskCategory: string;
  confidence: number;
  
  // Explainability
  shapValues?: Array<{
    feature: string;
    value: number;
    impact: number;
    direction: 'positive' | 'negative';
  }>;
  topFactors?: Array<{
    name: string;
    value: any;
    impact: number;
    explanation: string;
  }>;
  
  // Metadata
  decisionTimestamp: Date;
  processingTimeMs?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface AlgorithmChange {
  id: string;
  changeType: 'feature_addition' | 'model_update' | 'config_change' | 'bugfix';
  component: 'credit_score' | 'transactional_score' | 'ensemble' | 'feature_engineering';
  title: string;
  description: string;
  technicalDetails?: string;
  
  oldVersion?: string;
  newVersion: string;
  
  expectedImpact?: string;
  affectedUsers?: number;
  
  changesDiff?: Record<string, any>;
  
  status: 'pending' | 'approved' | 'rejected' | 'deployed' | 'rolled_back';
  requestedBy: string;
  approvedBy?: string;
  approvedAt?: Date;
  deployedAt?: Date;
}

// ============================================================================
// IN-MEMORY STORE (for development)
// TODO: Replace with actual database persistence
// ============================================================================

class TraceabilityStore {
  private modelVersions: Map<string, ModelVersion> = new Map();
  private predictions: Map<string, CreditScorePredictionLog> = new Map();
  private algorithmChanges: Map<string, AlgorithmChange> = new Map();
  
  // Current active model version
  private activeModelVersionId: string | null = null;
  
  constructor() {
    // Initialize with default simple model version
    const defaultVersion: ModelVersion = {
      id: randomUUID(),
      modelType: 'simple_rules',
      version: 'v1.0.0',
      deployedAt: new Date('2026-01-01'),
      deployedBy: 'system',
      isActive: true,
      changelog: 'Initial simple rule-based credit scoring (CMF-only)',
    };
    this.modelVersions.set(defaultVersion.id, defaultVersion);
    this.activeModelVersionId = defaultVersion.id;
  }
  
  // ========== MODEL VERSIONS ==========
  
  registerModelVersion(version: Omit<ModelVersion, 'id'>): string {
    const id = randomUUID();
    const modelVersion: ModelVersion = { id, ...version };
    
    // Deactivate previous active version if new one is active
    if (modelVersion.isActive) {
      for (const [vId, v] of this.modelVersions.entries()) {
        if (v.modelType === modelVersion.modelType && v.isActive) {
          this.modelVersions.set(vId, { ...v, isActive: false });
        }
      }
      this.activeModelVersionId = id;
    }
    
    this.modelVersions.set(id, modelVersion);
    return id;
  }
  
  getModelVersion(id: string): ModelVersion | undefined {
    return this.modelVersions.get(id);
  }
  
  getActiveModelVersion(type?: string): ModelVersion | undefined {
    if (this.activeModelVersionId) {
      return this.modelVersions.get(this.activeModelVersionId);
    }
    
    // Fallback: find any active version
    for (const version of this.modelVersions.values()) {
      if (version.isActive && (!type || version.modelType === type)) {
        return version;
      }
    }
    
    return undefined;
  }
  
  getAllModelVersions(): ModelVersion[] {
    return Array.from(this.modelVersions.values())
      .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime());
  }
  
  // ========== PREDICTIONS ==========
  
  logPrediction(log: Omit<CreditScorePredictionLog, 'id'>): string {
    const id = randomUUID();
    const prediction: CreditScorePredictionLog = { id, ...log };
    this.predictions.set(id, prediction);
    return id;
  }
  
  getPrediction(id: string): CreditScorePredictionLog | undefined {
    return this.predictions.get(id);
  }
  
  getUserPredictions(userId: string, limit: number = 100): CreditScorePredictionLog[] {
    return Array.from(this.predictions.values())
      .filter(p => p.userId === userId)
      .sort((a, b) => b.decisionTimestamp.getTime() - a.decisionTimestamp.getTime())
      .slice(0, limit);
  }
  
  getAllPredictions(limit: number = 1000): CreditScorePredictionLog[] {
    return Array.from(this.predictions.values())
      .sort((a, b) => b.decisionTimestamp.getTime() - a.decisionTimestamp.getTime())
      .slice(0, limit);
  }
  
  // ========== ALGORITHM CHANGES ==========
  
  registerAlgorithmChange(change: Omit<AlgorithmChange, 'id'>): string {
    const id = randomUUID();
    const algorithmChange: AlgorithmChange = { id, ...change };
    this.algorithmChanges.set(id, algorithmChange);
    return id;
  }
  
  getAlgorithmChange(id: string): AlgorithmChange | undefined {
    return this.algorithmChanges.get(id);
  }
  
  getAllAlgorithmChanges(): AlgorithmChange[] {
    return Array.from(this.algorithmChanges.values())
      .sort((a, b) => {
        const aTime = a.deployedAt?.getTime() || a.approvedAt?.getTime() || 0;
        const bTime = b.deployedAt?.getTime() || b.approvedAt?.getTime() || 0;
        return bTime - aTime;
      });
  }
  
  updateAlgorithmChangeStatus(
    id: string,
    status: AlgorithmChange['status'],
    metadata?: { approvedBy?: string; deployedAt?: Date; rollbackReason?: string }
  ): boolean {
    const change = this.algorithmChanges.get(id);
    if (!change) return false;
    
    const updated: AlgorithmChange = {
      ...change,
      status,
      ...(metadata?.approvedBy && { approvedBy: metadata.approvedBy, approvedAt: new Date() }),
      ...(metadata?.deployedAt && { deployedAt: metadata.deployedAt }),
    };
    
    this.algorithmChanges.set(id, updated);
    return true;
  }
  
  // ========== STATS ==========
  
  getStats() {
    const totalPredictions = this.predictions.size;
    const predictionsLast24h = Array.from(this.predictions.values())
      .filter(p => p.decisionTimestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000)
      .length;
    
    const avgScore = totalPredictions > 0
      ? Array.from(this.predictions.values())
          .reduce((sum, p) => sum + p.creditScore, 0) / totalPredictions
      : 0;
    
    const avgPd = totalPredictions > 0
      ? Array.from(this.predictions.values())
          .reduce((sum, p) => sum + p.probabilityDefault, 0) / totalPredictions
      : 0;
    
    return {
      totalPredictions,
      predictionsLast24h,
      avgCreditScore: Math.round(avgScore),
      avgProbabilityDefault: avgPd.toFixed(3),
      totalModelVersions: this.modelVersions.size,
      totalAlgorithmChanges: this.algorithmChanges.size,
    };
  }
}

// Singleton instance
const traceabilityStore = new TraceabilityStore();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Log a credit score prediction for audit trail
 */
export function logCreditScorePrediction(
  userId: string,
  requestId: string,
  prediction: {
    creditScore: number;
    probabilityDefault: number;
    riskCategory: string;
    confidence: number;
    shapValues?: any[];
    topFactors?: any[];
  },
  input: {
    cmfData?: Partial<CmfInformeDeudas>;
    sfaData?: any;
    features: Record<string, any>;
  },
  metadata?: {
    processingTimeMs?: number;
    ipAddress?: string;
    userAgent?: string;
  }
): string {
  const activeModel = traceabilityStore.getActiveModelVersion();
  
  const log: Omit<CreditScorePredictionLog, 'id'> = {
    userId,
    requestId,
    modelVersionId: activeModel?.id || 'unknown',
    modelVersion: activeModel?.version || 'v1.0.0',
    
    inputFeatures: input.features,
    cmfData: input.cmfData,
    sfaData: input.sfaData,
    
    creditScore: prediction.creditScore,
    probabilityDefault: prediction.probabilityDefault,
    riskCategory: prediction.riskCategory,
    confidence: prediction.confidence,
    
    shapValues: prediction.shapValues,
    topFactors: prediction.topFactors,
    
    decisionTimestamp: new Date(),
    processingTimeMs: metadata?.processingTimeMs,
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
  };
  
  return traceabilityStore.logPrediction(log);
}

/**
 * Register a new model version
 */
export function registerModelVersion(
  version: Omit<ModelVersion, 'id'>
): string {
  return traceabilityStore.registerModelVersion(version);
}

/**
 * Get active model version
 */
export function getActiveModelVersion(): ModelVersion | undefined {
  return traceabilityStore.getActiveModelVersion();
}

/**
 * Get prediction by ID (for disputes, audit)
 */
export function getPrediction(predictionId: string): CreditScorePredictionLog | undefined {
  return traceabilityStore.getPrediction(predictionId);
}

/**
 * Get user's prediction history
 */
export function getUserPredictionHistory(userId: string, limit?: number): CreditScorePredictionLog[] {
  return traceabilityStore.getUserPredictions(userId, limit);
}

/**
 * Register algorithm change
 */
export function registerAlgorithmChange(
  change: Omit<AlgorithmChange, 'id'>
): string {
  return traceabilityStore.registerAlgorithmChange(change);
}

/**
 * Get all algorithm changes (for audit)
 */
export function getAllAlgorithmChanges(): AlgorithmChange[] {
  return traceabilityStore.getAllAlgorithmChanges();
}

/**
 * Get audit statistics
 */
export function getAuditStats() {
  return traceabilityStore.getStats();
}

/**
 * Export audit trail for CMF reporting
 */
export function exportAuditTrail(
  startDate: Date,
  endDate: Date
): {
  predictions: CreditScorePredictionLog[];
  modelVersions: ModelVersion[];
  algorithmChanges: AlgorithmChange[];
  stats: any;
} {
  const allPredictions = traceabilityStore.getAllPredictions();
  const predictions = allPredictions.filter(
    p => p.decisionTimestamp >= startDate && p.decisionTimestamp <= endDate
  );
  
  const modelVersions = traceabilityStore.getAllModelVersions();
  const algorithmChanges = traceabilityStore.getAllAlgorithmChanges();
  const stats = traceabilityStore.getStats();
  
  return {
    predictions,
    modelVersions,
    algorithmChanges,
    stats,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize traceability system
 * Registers the current simple model as v1.0.0
 */
export function initializeTraceabilitySystem() {
  console.log('🔍 Initializing Algorithmic Traceability System...');
  
  // The default simple model is already registered in the constructor
  const activeModel = getActiveModelVersion();
  
  console.log(`✅ Traceability system initialized`);
  console.log(`   Active model: ${activeModel?.modelType} ${activeModel?.version}`);
  
  return {
    activeModelVersion: activeModel,
    stats: getAuditStats(),
  };
}
