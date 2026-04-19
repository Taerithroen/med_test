import path from "node:path";
import dayjs from "dayjs";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import fetch from "node-fetch";
import { z } from "zod";
import type { ReportRun } from "@prisma/client";
import { resolveCyrillicPdfFonts } from "../../lib/pdfFont.js";

const paramsSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional().default(55.751244),
  longitude: z.coerce.number().min(-180).max(180).optional().default(37.618423),
});

type OpenMeteoDaily = {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
};

export async function generateWeatherPdf(opts: {
  run: ReportRun;
  filesDir: string;
  relDir: string;
  onProgress: (pct: number, message: string) => Promise<void>;
}) {
  const { run, filesDir, relDir, onProgress } = opts;
  await onProgress(15, "Читаю параметры");

  const params = paramsSchema.parse((run.params ?? {}) as any);

  await onProgress(35, "Запрашиваю публичный API");
  const start = dayjs().subtract(6, "day").format("YYYY-MM-DD");
  const end = dayjs().format("YYYY-MM-DD");
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(params.latitude));
  url.searchParams.set("longitude", String(params.longitude));
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", start);
  url.searchParams.set("end_date", end);

  const res = await fetch(url.toString(), { headers: { "user-agent": "reports-prototype" } });
  if (!res.ok) throw new Error(`Сервис погоды ответил с ошибкой: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { daily?: OpenMeteoDaily };
  if (!json.daily) throw new Error("В ответе сервиса погоды нет блока daily");

  const daily = json.daily;
  const rows = daily.time.map((d, i) => ({
    date: d,
    tmax: daily.temperature_2m_max[i],
    tmin: daily.temperature_2m_min[i],
  }));

  await onProgress(65, "Формирую PDF");
  const outputName = `weather_${start}_${end}.pdf`;
  const outputPath = path.posix.join(relDir, outputName);
  const abs = path.join(filesDir, outputPath);

  const fonts = await resolveCyrillicPdfFonts();
  if (!fonts) {
    throw new Error(
      "Не найдены TTF для кириллицы: каталог fonts/ с NotoSans-Regular.ttf и NotoSans-Bold.ttf (см. backend/fonts).",
    );
  }

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const stream = fs.createWriteStream(abs);
    doc.pipe(stream);

    doc.font(fonts.regular);
    doc.fontSize(18).text("Погода за неделю (open-meteo)", { underline: false });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#444").text(
      `Координаты: ${params.latitude.toFixed(4)}, ${params.longitude.toFixed(4)} | Период: ${start}..${end}`,
    );
    doc.moveDown(1);

    // Простой “график” линиями без внешних библиотек: min/max как две линии.
    const chartX = doc.x;
    const chartY = doc.y;
    const chartW = 500;
    const chartH = 180;

    const tAll = rows.flatMap((r) => [r.tmin, r.tmax]);
    const tMin = Math.min(...tAll);
    const tMax = Math.max(...tAll);
    const pad = 2;
    const scaleY = (v: number) =>
      chartY + chartH - ((v - (tMin - pad)) / (tMax - tMin + pad * 2)) * chartH;
    const scaleX = (i: number) => chartX + (i * chartW) / Math.max(1, rows.length - 1);

    doc.rect(chartX, chartY, chartW, chartH).strokeColor("#DDD").stroke();
    doc.fontSize(9).fillColor("#666").text(`${tMax.toFixed(0)}°C`, chartX + chartW + 6, chartY - 3);
    doc.text(`${tMin.toFixed(0)}°C`, chartX + chartW + 6, chartY + chartH - 9);

    const drawLine = (key: "tmin" | "tmax", color: string) => {
      doc.strokeColor(color).lineWidth(2);
      rows.forEach((r, i) => {
        const x = scaleX(i);
        const y = scaleY(r[key]);
        if (i === 0) doc.moveTo(x, y);
        else doc.lineTo(x, y);
      });
      doc.stroke();
    };
    drawLine("tmax", "#e11d48");
    drawLine("tmin", "#2563eb");

    doc.moveDown(12);
    doc.y = chartY + chartH + 24;

    doc.fontSize(12).fillColor("#111").text("Данные");
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#111");

    const col1 = chartX;
    const col2 = chartX + 140;
    const col3 = chartX + 260;
    doc.font(fonts.bold);
    doc.text("Дата", col1).text("Мин, °C", col2).text("Макс, °C", col3);
    doc.font(fonts.regular);
    doc.moveDown(0.2);

    for (const r of rows) {
      doc.text(r.date, col1).text(r.tmin.toFixed(1), col2).text(r.tmax.toFixed(1), col3);
    }

    doc.end();

    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  await onProgress(92, "Файл сохранён");
  return { outputName, outputPath };
}

