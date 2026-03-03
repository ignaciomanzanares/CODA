/**
 * Audit & Compliance API Routes
 * 
 * Endpoints for CMF regulatory compliance:
 * - Algorithm traceability
 * - Model versioning
 * - Audit trail export
 * - Prediction history
 * 
 * Access: Admin only (for now)
 * 
 * @author AI Assistant (Cursor)
 * @date 2026-03-02
 */

import type { Express, Request, Response } from 'express';
import { authenticate, type AuthenticatedRequest } from './middleware/auth.js';
import {
  getUserPredictionHistory,
  getAllAlgorithmChanges,
  getActiveModelVersion,
  getAuditStats,
  exportAuditTrail,
  getPrediction,
} from './services/audit/algorithmicTraceability.js';

export function registerAuditRoutes(app: Express): void {
  try {
    console.log('📊 Registering audit & compliance routes...');
    
    // ========== USER PREDICTION HISTORY ==========
  
  /**
   * GET /api/audit/my-predictions
   * Get user's own credit score prediction history
   */
  app.get(
    '/api/audit/my-predictions',
    authenticate,
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      
      if (!authReq.user) {
        return res.status(401).json({ error: 'No autenticado' });
      }
      
      const userId = authReq.user.userId;
      
      try {
        const predictions = getUserPredictionHistory(userId, 50);
        
        // Sanitize for user display (remove internal details)
        const sanitized = predictions.map(p => ({
          id: p.id,
          timestamp: p.decisionTimestamp,
          creditScore: p.creditScore,
          riskCategory: p.riskCategory,
          confidence: p.confidence,
          topFactors: p.topFactors,
          modelVersion: p.modelVersion,
        }));
        
        res.json({
          predictions: sanitized,
          total: predictions.length,
        });
      } catch (error) {
        console.error('[AuditRoutes] Error fetching user predictions:', error);
        res.status(500).json({ error: 'Error al obtener historial de predicciones' });
      }
    }
  );
  
  /**
   * GET /api/audit/prediction/:id
   * Get detailed prediction by ID (for disputes)
   */
  app.get(
    '/api/audit/prediction/:id',
    authenticate,
    async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      
      if (!authReq.user) {
        return res.status(401).json({ error: 'No autenticado' });
      }
      
      const userId = authReq.user.userId;
      const predictionId = req.params.id;
      
      try {
        const prediction = getPrediction(predictionId);
        
        if (!prediction) {
          return res.status(404).json({ error: 'Predicción no encontrada' });
        }
        
        // Verify user owns this prediction
        if (prediction.userId !== userId) {
          return res.status(403).json({ error: 'No autorizado' });
        }
        
        // Return full details for user's own prediction
        res.json({
          id: prediction.id,
          timestamp: prediction.decisionTimestamp,
          creditScore: prediction.creditScore,
          probabilityDefault: prediction.probabilityDefault,
          riskCategory: prediction.riskCategory,
          confidence: prediction.confidence,
          topFactors: prediction.topFactors,
          shapValues: prediction.shapValues,
          modelVersion: prediction.modelVersion,
          processingTimeMs: prediction.processingTimeMs,
        });
      } catch (error) {
        console.error('[AuditRoutes] Error fetching prediction:', error);
        res.status(500).json({ error: 'Error al obtener detalle de predicción' });
      }
    }
  );
  
  // ========== ADMIN ENDPOINTS ==========
  
  /**
   * GET /api/audit/admin/stats
   * Get audit system statistics (admin only)
   */
  app.get(
    '/api/audit/admin/stats',
    authenticate,
    async (req: Request, res: Response) => {
      // TODO: Add admin role check
      const authReq = req as AuthenticatedRequest;
      
      try {
        const stats = getAuditStats();
        const activeModel = getActiveModelVersion();
        
        res.json({
          stats,
          activeModel: {
            version: activeModel?.version,
            modelType: activeModel?.modelType,
            deployedAt: activeModel?.deployedAt,
            trainingMetrics: activeModel?.trainingMetrics,
          },
        });
      } catch (error) {
        console.error('[AuditRoutes] Error fetching stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
      }
    }
  );
  
  /**
   * GET /api/audit/admin/algorithm-changes
   * Get all algorithm changes (admin only)
   */
  app.get(
    '/api/audit/admin/algorithm-changes',
    authenticate,
    async (req: Request, res: Response) => {
      // TODO: Add admin role check
      
      try {
        const changes = getAllAlgorithmChanges();
        res.json({ changes });
      } catch (error) {
        console.error('[AuditRoutes] Error fetching algorithm changes:', error);
        res.status(500).json({ error: 'Error al obtener cambios de algoritmo' });
      }
    }
  );
  
  /**
   * POST /api/audit/admin/export
   * Export audit trail for CMF reporting (admin only)
   */
  app.post(
    '/api/audit/admin/export',
    authenticate,
    async (req: Request, res: Response) => {
      // TODO: Add admin role check
      
      try {
        const { startDate, endDate } = req.body;
        
        if (!startDate || !endDate) {
          return res.status(400).json({ error: 'startDate y endDate son requeridos' });
        }
        
        const auditTrail = exportAuditTrail(
          new Date(startDate),
          new Date(endDate)
        );
        
        res.json({
          period: { startDate, endDate },
          ...auditTrail,
        });
      } catch (error) {
        console.error('[AuditRoutes] Error exporting audit trail:', error);
        res.status(500).json({ error: 'Error al exportar audit trail' });
      }
    }
  );
  
  console.log('✅ Audit routes registered');
  } catch (error) {
    console.error('❌ Error registering audit routes:', error);
    throw error;
  }
}
