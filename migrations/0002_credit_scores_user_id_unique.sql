-- Necesario para INSERT ... ON CONFLICT (user_id) DO UPDATE
ALTER TABLE credit_scores ADD CONSTRAINT credit_scores_user_id_key UNIQUE (user_id);
