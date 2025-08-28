-- Add new columns to users table for enhanced profile management
ALTER TABLE users
ADD COLUMN IF NOT EXISTS display_name TEXT,
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'English',
ADD COLUMN IF NOT EXISTS profile_picture TEXT,
ADD COLUMN IF NOT EXISTS user_metadata JSONB,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create index on updated_at for better performance
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at);

-- Update existing records to have default values for new columns
UPDATE users 
SET 
  timezone = COALESCE(timezone, 'UTC'),
  language = COALESCE(language, 'English'),
  updated_at = COALESCE(updated_at, created_at)
WHERE timezone IS NULL OR language IS NULL OR updated_at IS NULL;
