-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "params" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "outputFormat" TEXT,
    "outputPath" TEXT,
    "outputName" TEXT,
    "error" TEXT,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "region" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportRun_reportId_createdAt_idx" ON "ReportRun"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportRun_status_createdAt_idx" ON "ReportRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_date_idx" ON "Sale"("date");

-- CreateIndex
CREATE INDEX "Sale_region_idx" ON "Sale"("region");

