import path from "node:path";
import dayjs from "dayjs";
import ExcelJS from "exceljs";
import { z } from "zod";
import type { PrismaClient, ReportRun } from "@prisma/client";

const paramsSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .default({});

export async function generateSalesXlsx(opts: {
  prisma: PrismaClient;
  run: ReportRun;
  filesDir: string;
  relDir: string;
  onProgress: (pct: number, message: string) => Promise<void>;
}) {
  const { prisma, run, filesDir, relDir, onProgress } = opts;

  await onProgress(10, "Читаю параметры");
  const params = paramsSchema.parse((run.params ?? {}) as any);
  const from = params.from ? dayjs(params.from) : dayjs().subtract(14, "day");
  const to = params.to ? dayjs(params.to) : dayjs();

  await onProgress(25, "Читаю данные из БД");
  const sales = await prisma.sale.findMany({
    where: { date: { gte: from.toDate(), lte: to.toDate() } },
    orderBy: { date: "asc" },
  });

  await onProgress(55, "Считаю агрегаты");
  const byRegion = new Map<string, number>();
  for (const s of sales) byRegion.set(s.region, (byRegion.get(s.region) ?? 0) + s.amount);

  await onProgress(75, "Собираю XLSX");
  const wb = new ExcelJS.Workbook();
  wb.creator = "reports-prototype";

  const sheet = wb.addWorksheet("Сводка");
  sheet.columns = [
    { header: "Регион", key: "region", width: 20 },
    { header: "Сумма", key: "sum", width: 14 },
  ];
  for (const [region, sum] of [...byRegion.entries()].sort((a, b) => b[1] - a[1])) {
    sheet.addRow({ region, sum });
  }
  sheet.getRow(1).font = { bold: true };

  const raw = wb.addWorksheet("Данные");
  raw.columns = [
    { header: "Дата", key: "date", width: 14 },
    { header: "Регион", key: "region", width: 20 },
    { header: "Сумма", key: "amount", width: 12 },
  ];
  for (const s of sales) raw.addRow({ date: dayjs(s.date).format("YYYY-MM-DD"), region: s.region, amount: s.amount });
  raw.getRow(1).font = { bold: true };

  const outputName = `sales_${from.format("YYYYMMDD")}_${to.format("YYYYMMDD")}.xlsx`;
  const outputPath = path.posix.join(relDir, outputName);
  const abs = path.join(filesDir, outputPath);

  await onProgress(90, "Пишу файл");
  await wb.xlsx.writeFile(abs);

  return { outputName, outputPath };
}

