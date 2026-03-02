-- Migration: Add optional name column to expenses table
-- Created: 2026-02-22

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS name TEXT;
