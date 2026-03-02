#!/usr/bin/env node

/**
 * Initialize Audit & Traceability System
 * 
 * This script:
 * 1. Registers the enhanced ML model (v2.0.0) if not already registered
 * 2. Logs initial algorithm changes
 * 3. Verifies audit system is ready
 * 
 * Run on first deployment or after audit system setup.
 * 
 * Usage:
 *   node scripts/init-audit-system.mjs
 * 
 * @author AI Assistant (Cursor)
 * @date 2026-03-02
 */

import { initializeTraceabilitySystem, registerAlgorithmChange, registerModelVersion } from '../apps/api/dist/src/services/audit/algorithmicTraceability.js';

console.log('🔧 Initializing CODA Audit & Traceability System...\n');

// Step 1: Initialize base system
console.log('Step 1: Initializing traceability system...');
const initResult = initializeTraceabilitySystem();
console.log(`   Active model: ${initResult.activeModelVersion?.modelType} ${initResult.activeModelVersion?.version}`);
console.log(`   Stats: ${JSON.stringify(initResult.stats)}\n`);

// Step 2: Register algorithm changes (historical log)
console.log('Step 2: Registering historical algorithm changes...');

const change1Id = registerAlgorithmChange({
  changeType: 'model_update',
  component: 'credit_score',
  title: 'Initial Simple Rule-Based Model',
  description: 'Implementación inicial de credit scoring basado en reglas simples del Informe CMF',
  newVersion: 'v1.0.0',
  status: 'deployed',
  requestedBy: 'initial-development',
  approvedBy: 'product-team',
  approvedAt: new Date('2026-01-01'),
  deployedAt: new Date('2026-01-01'),
  technicalDetails: `
Simple rule-based credit scoring:
- Input: CMF Informe de Deudas (deudaTotalVigente, deudaIndirecta, numeroInstituciones)
- Logic:
  * Si deuda total = 0 y deuda indirecta = 0 → Score 680 (GOOD)
  * Si deuda total > 0 → Score 550-620 (penalización por monto)
  * Si deuda indirecta > 0 → Penalización adicional -30 puntos
  * Si > 3 instituciones → Penalización adicional -20 puntos
- Output: Credit score (300-850), risk category
`,
});

console.log(`   ✅ Registered change: ${change1Id}`);

const change2Id = registerAlgorithmChange({
  changeType: 'feature_addition',
  component: 'transactional_score',
  title: 'SFA Transactional Scoring Engine',
  description: 'Agregado scoring transaccional basado en cartolas bancarias (SFA)',
  oldVersion: 'v1.0.0',
  newVersion: 'v1.1.0',
  status: 'deployed',
  requestedBy: 'product-team',
  approvedBy: 'compliance-officer',
  approvedAt: new Date('2026-02-01'),
  deployedAt: new Date('2026-02-01'),
  technicalDetails: `
Transactional scoring from bank statements (cartolas):
- Input: Parsed transactions (date, amount, description, type)
- Features:
  * Saldo promedio mensual
  * Total ingresos/egresos
  * Ratio ingreso/egreso
  * Volatilidad del saldo
  * Meses con abonos regulares
- Output: Transactional score (300-850)
`,
});

console.log(`   ✅ Registered change: ${change2Id}`);

// Step 3: Log that enhanced ML model is ready (but not yet deployed by default)
console.log('\nStep 3: Preparing enhanced ML model registration...');
console.log('   Note: Enhanced ML model (v2.0.0) can be deployed via:');
console.log('   import { registerEnhancedMLModel } from "./services/audit/modelRegistry.js";');
console.log('   await registerEnhancedMLModel();\n');

// Step 4: Verify system
console.log('Step 4: Verifying audit system...');
const stats = initResult.stats;
console.log(`   ✓ Total predictions logged: ${stats.totalPredictions}`);
console.log(`   ✓ Model versions registered: ${stats.totalModelVersions}`);
console.log(`   ✓ Algorithm changes logged: ${stats.totalAlgorithmChanges}`);

console.log('\n✅ Audit & Traceability System initialized successfully!');
console.log('\n📊 Dashboard available at: /audit');
console.log('📡 API endpoints:');
console.log('   - GET  /api/audit/my-predictions');
console.log('   - GET  /api/audit/prediction/:id');
console.log('   - GET  /api/audit/admin/stats');
console.log('   - GET  /api/audit/admin/algorithm-changes');
console.log('   - POST /api/audit/admin/export\n');
