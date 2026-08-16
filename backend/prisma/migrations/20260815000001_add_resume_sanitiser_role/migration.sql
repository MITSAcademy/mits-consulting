-- Add resume_sanitiser to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'resume_sanitiser';
