import path from "node:path";
import fs from "node:fs/promises";
import ExcelJS from "exceljs";
import { parseSimpleCsv } from "./csv.js";
import { rowsFromOds } from "./odsRows.js";

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray((value as ExcelJS.CellRichTextValue).richText)) {
      return (value as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    }
    if ("text" in value) return String((value as ExcelJS.CellHyperlinkValue).text);
    if ("formula" in value) {
      const r = (value as ExcelJS.CellFormulaValue).result;
      return r === undefined || r === null ? "" : cellToString(r as ExcelJS.CellValue);
    }
  }
  return String(value);
}

async function rowsFromXlsx(absPath: string): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(absPath);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("В файле Excel нет листов");

  const out: string[][] = [];
  sheet.eachRow((row) => {
    const last = row.actualCellCount || 0;
    if (last === 0) {
      out.push([]);
      return;
    }
    const cells: string[] = [];
    for (let c = 1; c <= last; c++) {
      cells.push(cellToString(row.getCell(c).value));
    }
    out.push(cells);
  });

  if (!out.length) throw new Error("Первый лист Excel не содержит строк");
  return out;
}

/** Таблица из загруженного файла: .csv / .txt, первый лист .xlsx, первая таблица .ods / .xods (ODF ZIP + content.xml) */
export async function loadUploadTableRows(absPath: string): Promise<string[][]> {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === ".xlsx") return rowsFromXlsx(absPath);
  if (ext === ".ods" || ext === ".xods") return rowsFromOds(absPath);
  const raw = await fs.readFile(absPath, "utf8");
  const rows = parseSimpleCsv(raw);
  if (!rows.length) throw new Error("Файл пустой или не содержит строк данных");
  return rows;
}
