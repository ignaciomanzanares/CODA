-- Migration: Product Recommendation System + Lead Tracking
-- Purpose: Enable personalized product matching and revenue tracking
-- Date: 2026-03-10

-- =====================================================
-- STEP 1: Extend financial_products table
-- =====================================================

-- Add eligibility criteria columns
ALTER TABLE financial_products 
ADD COLUMN IF NOT EXISTS min_credit_score INTEGER,
ADD COLUMN IF NOT EXISTS max_credit_score INTEGER,
ADD COLUMN IF NOT EXISTS min_income INTEGER,
ADD COLUMN IF NOT EXISTS max_debt_to_income REAL;

-- Add monetization (pricing) columns
ALTER TABLE financial_products 
ADD COLUMN IF NOT EXISTS lead_fee INTEGER,
ADD COLUMN IF NOT EXISTS success_fee_bps INTEGER,
ADD COLUMN IF NOT EXISTS success_fee_flat INTEGER,
ADD COLUMN IF NOT EXISTS activation_bonus INTEGER;

-- Add performance metrics
ALTER TABLE financial_products 
ADD COLUMN IF NOT EXISTS approval_rate REAL,
ADD COLUMN IF NOT EXISTS avg_processing_days INTEGER;

-- Add matching algorithm configuration
ALTER TABLE financial_products 
ADD COLUMN IF NOT EXISTS matching_weights TEXT;

-- Add product management fields
ALTER TABLE financial_products 
ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS external_url TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS created_at TEXT DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT CURRENT_TIMESTAMP;

-- Create index for active products
CREATE INDEX IF NOT EXISTS idx_financial_products_active ON financial_products(is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_financial_products_category ON financial_products(category, is_active);

-- =====================================================
-- STEP 2: Create lead_tracking table
-- =====================================================

CREATE TABLE IF NOT EXISTS lead_tracking (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES financial_products(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'click', 'application', 'approval', 'rejection')),
  match_score REAL,
  user_credit_score INTEGER,
  user_transactional_score INTEGER,
  metadata TEXT, -- JSON: {sourcePage, filtersApplied, etc.}
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_lead_tracking_user ON lead_tracking(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_lead_tracking_product ON lead_tracking(product_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_lead_tracking_event ON lead_tracking(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_lead_tracking_funnel ON lead_tracking(user_id, product_id, event_type, timestamp);

-- =====================================================
-- STEP 3: Create product_applications table
-- =====================================================

CREATE TABLE IF NOT EXISTS product_applications (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES financial_products(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'withdrawn')),
  application_data TEXT, -- JSON: form data submitted
  external_application_id TEXT, -- ID from financial institution
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  responded_at TEXT,
  revenue_earned INTEGER, -- CLP earned from this application
  revenue_type TEXT, -- 'lead_fee' | 'success_fee' | 'activation_bonus'
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for revenue reports and user applications
CREATE INDEX IF NOT EXISTS idx_product_applications_user ON product_applications(user_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_applications_product ON product_applications(product_id, status);
CREATE INDEX IF NOT EXISTS idx_product_applications_status ON product_applications(status, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_applications_revenue ON product_applications(revenue_earned, applied_at DESC) WHERE revenue_earned IS NOT NULL;

-- =====================================================
-- COMMENTS (Documentation)
-- =====================================================

COMMENT ON TABLE lead_tracking IS 'Tracks all user interactions with financial products for funnel analytics and conversion optimization';
COMMENT ON TABLE product_applications IS 'Formal applications submitted by users to financial products, used for revenue tracking';
COMMENT ON COLUMN financial_products.min_credit_score IS 'Minimum credit score required for eligibility (300-850 scale)';
COMMENT ON COLUMN financial_products.success_fee_bps IS 'Success fee in basis points (e.g., 50 = 0.5% of loan amount)';
COMMENT ON COLUMN financial_products.matching_weights IS 'JSON configuration for matching algorithm weights';
COMMENT ON COLUMN lead_tracking.match_score IS 'Calculated match score (0-100) indicating how well the product fits the user';
COMMENT ON COLUMN product_applications.revenue_earned IS 'Total revenue (CLP) earned from this application (lead fee + success fee + bonuses)';
