-- Add Hold to SessionStatus enum
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'Hold';
