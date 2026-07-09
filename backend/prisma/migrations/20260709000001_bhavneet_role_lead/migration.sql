-- Fix Bhavneet's role from account_manager to lead
UPDATE "User" SET "role" = 'lead' WHERE "id" = 'u-bhavneet';
