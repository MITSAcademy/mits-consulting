CREATE TABLE IF NOT EXISTS "BrainNote" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "visibleTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrainNote_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BrainNote" ADD CONSTRAINT "BrainNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
