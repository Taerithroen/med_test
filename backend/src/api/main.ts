import Fastify from "fastify";
import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "../lib/prisma.js";
import { REPORTS, getReportById } from "../reports/registry.js";
import { reportQueue } from "../lib/queue.js";
import { sanitizeUploadFileName } from "../lib/sanitizeUploadName.js";

const PORT = Number(process.env.PORT || 3000);
const FILES_DIR = process.env.FILES_DIR || path.resolve("files");

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

await app.register(multipart, {
  limits: { fileSize: 5 * 1024 * 1024 },
});

await app.register(staticPlugin, {
  root: FILES_DIR,
  prefix: "/files/",
});

app.get("/health", async () => ({ ok: true }));

app.get("/api/reports", async () => ({ reports: REPORTS }));

app.get("/api/uploads", async (_req, reply) =>
  reply
    .code(405)
    .header("Allow", "POST")
    .send({
      error: "method_not_allowed",
      message:
        "Загрузка только методом POST (multipart/form-data, поле file). Расширения: .csv, .txt, .xlsx (первый лист), .xods или .ods (первая таблица, ODF), до 5 МБ.",
    }),
);

app.post("/api/uploads", async (req, reply) => {
  const data = await req.file();
  if (!data) return reply.code(400).send({ error: "file_required" });

  const ext = path.extname(data.filename).toLowerCase();
  if (ext !== ".csv" && ext !== ".txt" && ext !== ".xlsx" && ext !== ".ods" && ext !== ".xods")
    return reply
      .code(400)
      .send({
        error: "upload_type_not_allowed",
        message: "Допустимы файлы .csv, .txt, .xlsx, .xods или .ods.",
      });

  const buf = await data.toBuffer();
  if (!buf.length) return reply.code(400).send({ error: "empty_file" });

  const uploadId = randomUUID();
  const fileName = sanitizeUploadFileName(data.filename);
  const dir = path.join(FILES_DIR, "uploads", uploadId);
  await fs.mkdir(dir, { recursive: true });
  const abs = path.join(dir, fileName);
  await fs.writeFile(abs, buf);

  try {
    await prisma.fileUpload.create({
      data: {
        id: uploadId,
        fileName,
        originalFileName: String(data.filename).slice(0, 500) || null,
        sizeBytes: buf.length,
        contentType: data.mimetype ? String(data.mimetype).slice(0, 200) : null,
      },
    });
  } catch (err) {
    req.log.error({ err }, "file_upload_db_failed");
    await fs.unlink(abs).catch(() => {});
    await fs.rmdir(dir).catch(() => {});
    return reply.code(500).send({ error: "upload_persist_failed", message: "Не удалось сохранить метаданные загрузки." });
  }

  return reply.send({ uploadId, fileName });
});

app.get("/api/runs", async (req) => {
  const querySchema = z.object({
    reportId: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  });
  const q = querySchema.parse((req as any).query ?? {});

  const runs = await prisma.reportRun.findMany({
    where: q.reportId ? { reportId: q.reportId } : undefined,
    orderBy: { createdAt: "desc" },
    take: q.limit,
  });

  return { runs };
});

app.get("/api/runs/:id", async (req, reply) => {
  const paramsSchema = z.object({ id: z.string() });
  const { id } = paramsSchema.parse((req as any).params);

  const run = await prisma.reportRun.findUnique({ where: { id } });
  if (!run) return reply.code(404).send({ error: "run_not_found" });

  const report = getReportById(run.reportId);
  return { run, report };
});

app.post("/api/reports/:reportId/runs", async (req, reply) => {
  const paramsSchema = z.object({ reportId: z.string() });
  const bodySchema = z.object({
    format: z.enum(["xlsx", "pdf"]).optional(),
    params: z.record(z.string(), z.any()).optional(),
  });

  const { reportId } = paramsSchema.parse((req as any).params);
  const body = bodySchema.parse((req as any).body ?? {});

  const report = getReportById(reportId);
  if (!report) return reply.code(404).send({ error: "report_not_found" });

  const format = body.format ?? report.defaultFormat;
  if (!report.supportedFormats.includes(format))
    return reply.code(400).send({ error: "format_not_supported" });

  if (reportId === "upload-csv") {
    const uploadParams = z.object({
      uploadId: z.string().uuid(),
      fileName: z.string().min(1).max(200),
    });
    const parsed = uploadParams.safeParse(body.params ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "upload_params_invalid" });
    const safeName = path.basename(parsed.data.fileName);
    const uploadRow = await prisma.fileUpload.findUnique({ where: { id: parsed.data.uploadId } });
    if (!uploadRow || uploadRow.fileName !== safeName)
      return reply.code(400).send({ error: "upload_not_found" });
    const abs = path.join(FILES_DIR, "uploads", parsed.data.uploadId, safeName);
    try {
      await fs.stat(abs);
    } catch {
      return reply.code(400).send({ error: "upload_not_found" });
    }
  }

  const run = await prisma.reportRun.create({
    data: {
      reportId,
      status: "QUEUED",
      params: body.params ?? {},
      progressPct: 0,
      outputFormat: format,
    },
  });

  await reportQueue.add("generate", { runId: run.id });

  return reply.code(202).send({ runId: run.id });
});

app.get("/api/runs/:id/download", async (req, reply) => {
  const paramsSchema = z.object({ id: z.string() });
  const { id } = paramsSchema.parse((req as any).params);

  const run = await prisma.reportRun.findUnique({ where: { id } });
  if (!run) return reply.code(404).send({ error: "run_not_found" });
  if (run.status !== "SUCCEEDED" || !run.outputPath || !run.outputName)
    return reply.code(409).send({ error: "run_not_ready" });

  const absPath = path.join(FILES_DIR, run.outputPath);
  try {
    await fs.stat(absPath);
  } catch {
    return reply.code(410).send({ error: "file_missing" });
  }

  reply.header("Content-Disposition", `attachment; filename="${run.outputName}"`);
  return reply.sendFile(run.outputPath);
});

app.listen({ port: PORT, host: "0.0.0.0" });

