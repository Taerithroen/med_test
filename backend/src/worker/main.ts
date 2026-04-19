import { Worker } from "bullmq";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "../lib/prisma.js";
import { generateSalesXlsx } from "./reports/sales-xlsx.js";
import { generateWeatherPdf } from "./reports/weather-pdf.js";
import { generateUploadCsvReport } from "./reports/upload-csv.js";

const FILES_DIR = process.env.FILES_DIR || path.resolve("files");
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const url = new URL(redisUrl);

async function ensureFilesDir() {
  await fs.mkdir(FILES_DIR, { recursive: true });
}

await ensureFilesDir();

type JobPayload = { runId: string };

const worker = new Worker<JobPayload>(
  "report-jobs",
  async (job) => {
    const { runId } = job.data;

    const run = await prisma.reportRun.findUnique({ where: { id: runId } });
    if (!run) return;

    await prisma.reportRun.update({
      where: { id: runId },
      data: { status: "RUNNING", startedAt: new Date(), progressPct: 5, message: "Запуск обработки" },
    });

    const safeDir = runId;
    await fs.mkdir(path.join(FILES_DIR, safeDir), { recursive: true });

    try {
      if (run.reportId === "sales-xlsx") {
        const out = await generateSalesXlsx({
          prisma,
          run,
          filesDir: FILES_DIR,
          relDir: safeDir,
          onProgress: async (pct, message) => {
            await prisma.reportRun.update({
              where: { id: runId },
              data: { progressPct: pct, message },
            });
          },
        });

        await prisma.reportRun.update({
          where: { id: runId },
          data: {
            status: "SUCCEEDED",
            finishedAt: new Date(),
            progressPct: 100,
            message: "Генерация завершена",
            outputPath: out.outputPath,
            outputName: out.outputName,
          },
        });
        return;
      }

      if (run.reportId === "weather-pdf") {
        const out = await generateWeatherPdf({
          run,
          filesDir: FILES_DIR,
          relDir: safeDir,
          onProgress: async (pct, message) => {
            await prisma.reportRun.update({
              where: { id: runId },
              data: { progressPct: pct, message },
            });
          },
        });

        await prisma.reportRun.update({
          where: { id: runId },
          data: {
            status: "SUCCEEDED",
            finishedAt: new Date(),
            progressPct: 100,
            message: "Генерация завершена",
            outputPath: out.outputPath,
            outputName: out.outputName,
          },
        });
        return;
      }

      if (run.reportId === "upload-csv") {
        const out = await generateUploadCsvReport({
          prisma,
          run,
          filesDir: FILES_DIR,
          relDir: safeDir,
          onProgress: async (pct, message) => {
            await prisma.reportRun.update({
              where: { id: runId },
              data: { progressPct: pct, message },
            });
          },
        });

        await prisma.reportRun.update({
          where: { id: runId },
          data: {
            status: "SUCCEEDED",
            finishedAt: new Date(),
            progressPct: 100,
            message: "Генерация завершена",
            outputPath: out.outputPath,
            outputName: out.outputName,
          },
        });
        return;
      }

      await prisma.reportRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          progressPct: 100,
          error: `Неизвестный reportId: ${run.reportId}`,
          message: "Ошибка",
        },
      });
    } catch (e: any) {
      await prisma.reportRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          progressPct: 100,
          error: String(e?.stack || e?.message || e),
          message: "Ошибка",
        },
      });
      throw e;
    }
  },
  {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
      password: url.password || undefined,
    },
    concurrency: 2,
  },
);

worker.on("failed", (job, err) => {
  // eslint-disable-next-line no-console
  console.error("job failed", job?.id, err);
});

