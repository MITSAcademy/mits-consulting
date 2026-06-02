-- Switch Roshni's outbound From: header from the mc.sales@ Google Group back to her
-- own address. Workspace admin would need to enable group send-as before mc.sales
-- can be used; clearing the override sends from roshni.seth@ directly which "just
-- works" the moment she configures her App Password.
UPDATE "User" SET "sendAsAddress" = NULL WHERE "id" = 'u-roshni';
