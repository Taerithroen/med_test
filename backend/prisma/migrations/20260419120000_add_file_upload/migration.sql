-- CreateTable
CREATE TABLE "FileUpload" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileUpload_createdAt_idx" ON "FileUpload"("createdAt");
