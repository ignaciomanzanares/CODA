/**
 * Unit Tests for Algorithmic Traceability Service
 * 
 * Tests:
 * - Model version registration
 * - Prediction logging
 * - Audit trail export
 * - Statistics computation
 * 
 * @author AI Assistant (Cursor)
 * @date 2026-03-02
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  logCreditScorePrediction,
  registerModelVersion,
  getActiveModelVersion,
  getPrediction,
  getUserPredictionHistory,
  registerAlgorithmChange,
  getAllAlgorithmChanges,
  getAuditStats,
  exportAuditTrail,
} from '../algorithmicTraceability';

describe('Algorithmic Traceability', () => {
  describe('Model Version Management', () => {
    it('should register a new model version', () => {
      const versionId = registerModelVersion({
        modelType: 'xgboost',
        version: 'v2.0.0',
        deployedAt: new Date(),
        deployedBy: 'data-science-team',
        isActive: true,
        trainingMetrics: {
          auc: 0.85,
          gini: 0.70,
        },
        changelog: 'Initial XGBoost model',
      });
      
      expect(versionId).toBeTruthy();
      expect(typeof versionId).toBe('string');
    });
    
    it('should retrieve active model version', () => {
      registerModelVersion({
        modelType: 'ensemble',
        version: 'v2.1.0',
        deployedAt: new Date(),
        deployedBy: 'test',
        isActive: true,
        changelog: 'Test model',
      });
      
      const activeModel = getActiveModelVersion();
      
      expect(activeModel).toBeDefined();
      expect(activeModel?.version).toBe('v2.1.0');
      expect(activeModel?.isActive).toBe(true);
    });
    
    it('should deactivate previous model when new one is activated', () => {
      const oldModelId = registerModelVersion({
        modelType: 'logistic_regression',
        version: 'v1.0.0',
        deployedAt: new Date(),
        deployedBy: 'test',
        isActive: true,
        changelog: 'Old model',
      });
      
      const newModelId = registerModelVersion({
        modelType: 'logistic_regression',
        version: 'v2.0.0',
        deployedAt: new Date(),
        deployedBy: 'test',
        isActive: true,
        changelog: 'New model',
      });
      
      const activeModel = getActiveModelVersion();
      
      expect(activeModel?.id).toBe(newModelId);
      expect(activeModel?.version).toBe('v2.0.0');
    });
  });
  
  describe('Prediction Logging', () => {
    it('should log a credit score prediction', () => {
      const predictionId = logCreditScorePrediction(
        'user-123',
        'request-456',
        {
          creditScore: 720,
          probabilityDefault: 0.08,
          riskCategory: 'GOOD',
          confidence: 0.87,
          topFactors: [
            {
              name: 'Deuda Total',
              value: 0,
              impact: 100,
              explanation: 'Sin deudas vigentes',
            }
          ]
        },
        {
          cmfData: {
            tipo: 'cmf_informe_deudas',
            rutDocumento: '12.345.678-9',
            deudaTotalVigente: 0,
            deudaIndirecta: 0,
            numeroInstituciones: 0,
          },
          features: {
            deudaTotalVigente: 0,
            deudaIndirecta: 0,
            numeroInstituciones: 0,
          }
        },
        {
          processingTimeMs: 234,
          ipAddress: '192.168.1.1',
        }
      );
      
      expect(predictionId).toBeTruthy();
      
      const prediction = getPrediction(predictionId);
      
      expect(prediction).toBeDefined();
      expect(prediction?.userId).toBe('user-123');
      expect(prediction?.creditScore).toBe(720);
      expect(prediction?.riskCategory).toBe('GOOD');
      expect(prediction?.topFactors).toHaveLength(1);
    });
    
    it('should retrieve user prediction history', () => {
      const userId = 'user-789';
      
      logCreditScorePrediction(
        userId,
        'req-1',
        { creditScore: 680, probabilityDefault: 0.12, riskCategory: 'GOOD', confidence: 0.8 },
        { features: {} }
      );
      
      logCreditScorePrediction(
        userId,
        'req-2',
        { creditScore: 720, probabilityDefault: 0.08, riskCategory: 'GOOD', confidence: 0.85 },
        { features: {} }
      );
      
      const history = getUserPredictionHistory(userId);
      
      expect(history).toHaveLength(2);
      expect(history[0].creditScore).toBe(720); // Most recent first
      expect(history[1].creditScore).toBe(680);
    });
    
    it('should limit prediction history results', () => {
      const userId = 'user-limit-test';
      
      for (let i = 0; i < 150; i++) {
        logCreditScorePrediction(
          userId,
          `req-${i}`,
          { creditScore: 700 + i, probabilityDefault: 0.1, riskCategory: 'GOOD', confidence: 0.8 },
          { features: {} }
        );
      }
      
      const history = getUserPredictionHistory(userId, 50);
      
      expect(history).toHaveLength(50);
    });
  });
  
  describe('Algorithm Changes', () => {
    it('should register algorithm change', () => {
      const changeId = registerAlgorithmChange({
        changeType: 'feature_addition',
        component: 'credit_score',
        title: 'Add SFA transactional features',
        description: 'Integrate bank transaction patterns into credit scoring',
        oldVersion: 'v1.0.0',
        newVersion: 'v2.0.0',
        status: 'pending',
        requestedBy: 'data-team',
      });
      
      expect(changeId).toBeTruthy();
      
      const changes = getAllAlgorithmChanges();
      
      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0].title).toBe('Add SFA transactional features');
    });
  });
  
  describe('Audit Statistics', () => {
    it('should compute audit statistics', () => {
      logCreditScorePrediction(
        'user-stats-1',
        'req-stats-1',
        { creditScore: 720, probabilityDefault: 0.08, riskCategory: 'GOOD', confidence: 0.9 },
        { features: {} }
      );
      
      logCreditScorePrediction(
        'user-stats-2',
        'req-stats-2',
        { creditScore: 650, probabilityDefault: 0.18, riskCategory: 'AVERAGE', confidence: 0.75 },
        { features: {} }
      );
      
      const stats = getAuditStats();
      
      expect(stats.totalPredictions).toBeGreaterThanOrEqual(2);
      expect(stats.avgCreditScore).toBeGreaterThan(0);
      expect(stats.totalModelVersions).toBeGreaterThan(0);
    });
  });
  
  describe('Audit Trail Export', () => {
    it('should export audit trail for date range', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      logCreditScorePrediction(
        'user-export-test',
        'req-export',
        { creditScore: 700, probabilityDefault: 0.1, riskCategory: 'GOOD', confidence: 0.8 },
        { features: {} }
      );
      
      const auditTrail = exportAuditTrail(yesterday, tomorrow);
      
      expect(auditTrail.predictions.length).toBeGreaterThan(0);
      expect(auditTrail.modelVersions).toBeDefined();
      expect(auditTrail.algorithmChanges).toBeDefined();
      expect(auditTrail.stats).toBeDefined();
    });
    
    it('should filter predictions by date range', () => {
      const farPast = new Date('2020-01-01');
      const past = new Date('2020-12-31');
      
      const auditTrail = exportAuditTrail(farPast, past);
      
      // Should have 0 predictions from 2020
      expect(auditTrail.predictions).toHaveLength(0);
    });
  });
});
