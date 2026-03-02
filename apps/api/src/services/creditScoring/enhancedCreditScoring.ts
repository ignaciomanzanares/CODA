/**
 * Enhanced Credit Scoring Service
 * 
 * Integrates robust ML models (Logistic Regression, XGBoost) with CODA's backend.
 * Calls Python credit_scoring_engine.py for predictions.
 * 
 * @author AI Assistant (Cursor)
 * @date 2026-03-02
 */

import { spawn } from 'child_process';
import path from 'path';
import type { CmfInformeDeudas } from '../documents/pdfAnalysis.js';

export interface CreditScoreResult {
  score: number;  // 300-850
  probabilityDefault: number;  // 0-1
  riskCategory: 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR' | 'VERY_POOR';
  confidence: number;  // 0-1
  topFactors: Array<{
    feature: string;
    value: number;
    impact: number;
    direction: 'positive' | 'negative';
  }>;
  modelVersion: string;
}

export interface Demographics {
  age?: number;
  income?: number;
  employmentLength?: number;
}

/**
 * Call Python ML engine for credit scoring prediction
 */
export async function predictCreditScore(
  cmfData: CmfInformeDeudas,
  sfaData: any,
  demographics?: Demographics
): Promise<CreditScoreResult> {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(
      __dirname,
      '../../../ml/credit_scoring_engine.py'
    );
    
    // Prepare input data
    const inputData = JSON.stringify({
      cmf: {
        deudaTotalVigente: cmfData.deudaTotalVigente,
        deudaIndirecta: cmfData.deudaIndirecta,
        numeroInstituciones: cmfData.numeroInstituciones
      },
      sfa: sfaData,
      demographics: demographics || {}
    });
    
    // Spawn Python process
    const pythonProcess = spawn('python3', [
      pythonScriptPath,
      '--predict',
      '--input', inputData
    ]);
    
    let stdoutData = '';
    let stderrData = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python process exited with code ${code}: ${stderrData}`));
        return;
      }
      
      try {
        const result = JSON.parse(stdoutData);
        resolve({
          score: result.score,
          probabilityDefault: result.probability_default,
          riskCategory: result.risk_category,
          confidence: result.confidence,
          topFactors: result.top_factors || [],
          modelVersion: result.model_version
        });
      } catch (error) {
        reject(new Error(`Failed to parse Python output: ${error}`));
      }
    });
  });
}

/**
 * Fallback: Rule-based credit score (if ML model not available)
 * This is the current simple implementation from documentUploadService.ts
 */
export function computeSimpleCreditScore(cmf: CmfInformeDeudas): number {
  const CREDIT_SCORE_EXCELLENT = 680;
  const CREDIT_SCORE_MAX = 850;
  
  if (cmf.deudaTotalVigente === 0 && cmf.deudaIndirecta === 0) return CREDIT_SCORE_EXCELLENT;
  if (cmf.numeroInstituciones === 0) return CREDIT_SCORE_EXCELLENT;
  
  const ratio = cmf.deudaIndirecta / Math.max(1, cmf.deudaTotalVigente);
  const penalizacion = ratio > 0.5 ? 40 : ratio > 0.2 ? 20 : 0;
  
  return Math.max(300, Math.min(CREDIT_SCORE_MAX, CREDIT_SCORE_EXCELLENT - penalizacion));
}

/**
 * Main credit scoring function with fallback
 */
export async function computeEnhancedCreditScore(
  cmfData: CmfInformeDeudas,
  sfaData: any,
  demographics?: Demographics
): Promise<CreditScoreResult> {
  try {
    // Try ML model first
    const result = await predictCreditScore(cmfData, sfaData, demographics);
    return result;
  } catch (error) {
    console.warn('[EnhancedCreditScoring] ML model failed, using simple fallback:', error);
    
    // Fallback to simple rule-based score
    const score = computeSimpleCreditScore(cmfData);
    const pd = (850 - score) / 550;  // Rough approximation
    
    return {
      score,
      probabilityDefault: pd,
      riskCategory: getRiskCategory(score),
      confidence: 0.7,  // Lower confidence for simple model
      topFactors: [],
      modelVersion: 'simple-v1.0.0'
    };
  }
}

function getRiskCategory(score: number): CreditScoreResult['riskCategory'] {
  if (score >= 750) return 'EXCELLENT';
  if (score >= 680) return 'GOOD';
  if (score >= 620) return 'AVERAGE';
  if (score >= 550) return 'POOR';
  return 'VERY_POOR';
}
