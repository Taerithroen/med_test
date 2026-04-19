import path from "node:path";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { z } from "zod";
import type { PrismaClient, ReportRun } from "@prisma/client";
import { loadUploadTableRows } from "../../lib/loadUploadTableRows.js";
import { resolveCyrillicPdfFonts } from "../../lib/pdfFont.js";

const paramsSchema = z.object({
  uploadId: z.string().uuid(),
  fileName: z.string().min(1).max(200),
});

export async function generateUploadCsvReport(opts: {
  prisma: PrismaClient;
  run: ReportRun;
  filesDir: string;
  relDir: string;
  onProgress: (pct: number, message: string) => Promise<void>;
}) {
  const { prisma, run, filesDir, relDir, onProgress } = opts;

  await onProgress(10, "Проверяю параметры");
  const params = paramsSchema.parse((run.params ?? {}) as unknown);

  const safeName = path.basename(params.fileName);
  const uploadRow = await prisma.fileUpload.findUnique({ where: { id: params.uploadId } });
  if (!uploadRow || uploadRow.fileName !== safeName) {
    throw new Error("Загрузка не найдена в базе или имя файла не совпадает.");
  }
  const srcAbs = path.join(filesDir, "uploads", params.uploadId, safeName);
  await fs.access(srcAbs);

  await onProgress(25, "Читаю таблицу из файла");
  const rows = await loadUploadTableRows(srcAbs);

  const format = run.outputFormat === "pdf" ? "pdf" : "xlsx";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  if (format === "xlsx") {
    await onProgress(55, "Собираю XLSX");
    const wb = new ExcelJS.Workbook();
    wb.creator = "reports-prototype";
    const sheet = wb.addWorksheet("Из файла");
    for (const row of rows) sheet.addRow(row);

    const outputName = `upload_${stamp}.xlsx`;
    const outputPath = path.posix.join(relDir, outputName);
    const abs = path.join(filesDir, outputPath);
    await onProgress(85, "Пишу файл");
    await wb.xlsx.writeFile(abs);
    return { outputName, outputPath };
  }

  await onProgress(55, "Собираю PDF");
  const outputName = `upload_${stamp}.pdf`;
  const outputPath = path.posix.join(relDir, outputName);
  const abs = path.join(filesDir, outputPath);

  const fonts = await resolveCyrillicPdfFonts();
  if (!fonts) {
    throw new Error(
      "Не найдены TTF для кириллицы: положите NotoSans-Regular.ttf и NotoSans-Bold.ttf в каталог fonts/ (рядом с node_modules в dev или /app/fonts в Docker).",
    );
  }

  const colCount = Math.max(1, ...rows.map((r) => r.length));
  const pageW = 520;
  const margin = 40;
  const colW = Math.min(120, (pageW - margin * 2) / colCount);
  const rowH = 18;

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const stream = createWriteStream(abs);
    doc.pipe(stream);
    doc.font(fonts.regular);
    doc.fontSize(10).text("Таблица из загруженного файла", { underline: true });
    doc.moveDown(0.5);

    let y = doc.y + 6;
    for (const row of rows) {
      if (y > 750) {
        doc.addPage();
        doc.font(fonts.regular);
        y = 50;
      }
      let x = margin;
      for (let i = 0; i < colCount; i++) {
        const cell = row[i] ?? "";
        doc.fontSize(8).text(cell.slice(0, 80), x, y, { width: colW - 4, lineBreak: false });
        x += colW;
      }
      y += rowH;
    }
    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  await onProgress(90, "PDF сохранён");
  return { outputName, outputPath };
}
