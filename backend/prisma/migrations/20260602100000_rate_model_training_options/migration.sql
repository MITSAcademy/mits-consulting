-- Add Training payment options to the RateModel enum so trainers paid per
-- training program (one-shot or monthly) can be tracked accurately.
ALTER TYPE "RateModel" ADD VALUE IF NOT EXISTS 'training_one_shot';
ALTER TYPE "RateModel" ADD VALUE IF NOT EXISTS 'training_monthly';
