/**
 * Seed Script: Product Catalog
 * 
 * Populates financial_products table with real Chilean products
 * Based on productCatalog.ts
 * 
 * Usage: 
 * DATABASE_URL="..." npm run seed:products -w @coda/api
 */

import { db, financialProducts } from '../db/index.js';
import { productCatalog } from '../services/products/productCatalog.js';
import { logger } from '../logger.js';

async function seedProducts() {
  try {
    console.log('🌱 Seeding financial products...');
    console.log(`📦 Found ${productCatalog.length} products in catalog`);
    console.log('');

    let insertedCount = 0;
    let skippedCount = 0;

    for (const product of productCatalog) {
      try {
        // Check if product already exists
        const existing = await db
          .select()
          .from(financialProducts)
          .where(sql`${financialProducts.productName} = ${product.productName} AND ${financialProducts.provider} = ${product.provider}`)
          .limit(1);

        if (existing.length > 0) {
          console.log(`⏭️  Skipping (already exists): ${product.provider} - ${product.productName}`);
          skippedCount++;
          continue;
        }

        // Insert product
        await db.insert(financialProducts).values({
          productName: product.productName,
          provider: product.provider,
          productType: product.productType,
          category: product.category,
          interestRate: product.interestRate ?? null,
          term: product.term ?? null,
          termUnit: product.termUnit ?? null,
          monthlyPayment: product.monthlyPayment ?? null,
          loanAmount: product.loanAmount ?? null,
          description: product.description,
          requirements: product.requirements,
          features: product.features,
          minCreditScore: product.minCreditScore ?? null,
          maxCreditScore: product.maxCreditScore ?? null,
          minIncome: product.minIncome ?? null,
          maxDebtToIncome: product.maxDebtToIncome ?? null,
          leadFee: product.leadFee ?? null,
          successFeeBps: product.successFeeBps ?? null,
          successFeeFlat: product.successFeeFlat ?? null,
          activationBonus: product.activationBonus ?? null,
          approvalRate: product.approvalRate ?? null,
          avgProcessingDays: product.avgProcessingDays ?? null,
          matchingWeights: product.matchingWeights ?? null,
          isActive: product.isActive,
          priority: product.priority,
          externalUrl: product.externalUrl ?? null,
          logoUrl: product.logoUrl ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        console.log(`✅ Inserted: ${product.provider} - ${product.productName}`);
        insertedCount++;
      } catch (error) {
        console.error(`❌ Failed to insert: ${product.productName}`, error);
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Inserted: ${insertedCount} products`);
    console.log(`⏭️  Skipped: ${skippedCount} products`);
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('🎉 Seeding complete!');

    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Failed to seed products');
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Fix import for sql
import { sql } from 'drizzle-orm';

seedProducts();
