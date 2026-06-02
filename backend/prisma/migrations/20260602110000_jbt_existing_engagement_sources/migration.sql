-- Seed JBT + Existing engagement lead sources so they show up in the
-- new-lead Source dropdown without requiring a full re-seed.
INSERT INTO "LeadSource" ("id", "name")
SELECT 'src-jbt', 'JBT'
WHERE NOT EXISTS (SELECT 1 FROM "LeadSource" WHERE "name" = 'JBT');

INSERT INTO "LeadSource" ("id", "name")
SELECT 'src-existing-eng', 'Existing engagement'
WHERE NOT EXISTS (SELECT 1 FROM "LeadSource" WHERE "name" = 'Existing engagement');
