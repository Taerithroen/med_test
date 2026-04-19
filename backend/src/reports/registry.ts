export type ReportFormat = "xlsx" | "pdf";

export type ReportDefinition = {
  id: string;
  name: string;
  description: string;
  supportedFormats: ReportFormat[];
  defaultFormat: ReportFormat;
};

export const REPORTS: ReportDefinition[] = [
  {
    id: "sales-xlsx",
    name: "Продажи по регионам (XLSX)",
    description: "Отчёт из локальной БД: суммы продаж по регионам за период.",
    supportedFormats: ["xlsx"],
    defaultFormat: "xlsx",
  },
  {
    id: "weather-pdf",
    name: "Погода за неделю (PDF)",
    description:
      "Отчёт из публичного API (open-meteo.com): температурный график + таблица.",
    supportedFormats: ["pdf"],
    defaultFormat: "pdf",
  },
  {
    id: "upload-csv",
    name: "Загрузка файла",
    description:
      "Загрузка файла с табличными данными (до 5 МБ). Затем выберите формат результата и сформируйте отчёт.",
    supportedFormats: ["xlsx", "pdf"],
    defaultFormat: "xlsx",
  },
];

export function getReportById(id: string) {
  return REPORTS.find((r) => r.id === id) ?? null;
}

