import React, { useEffect, useMemo, useRef, useState } from "react";

type Report = {
  id: string;
  name: string;
  description: string;
  supportedFormats: Array<"xlsx" | "pdf">;
  defaultFormat: "xlsx" | "pdf";
};

type Run = {
  id: string;
  reportId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  progressPct: number;
  message: string | null;
  outputFormat: string | null;
  outputName: string | null;
  error: string | null;
};

/** Prisma/JSON иногда отдают enum в другом регистре — нормализуем для UI. */
function asRunStatus(raw: string | undefined): Run["status"] {
  const u = String(raw ?? "").toUpperCase();
  if (u === "QUEUED" || u === "RUNNING" || u === "SUCCEEDED" || u === "FAILED") return u;
  return "QUEUED";
}

function runStatusLabel(status: Run["status"]): string {
  const labels: Record<Run["status"], string> = {
    QUEUED: "В очереди",
    RUNNING: "Выполняется",
    SUCCEEDED: "Успешно",
    FAILED: "Ошибка",
  };
  return labels[status];
}

/** Строка прогресса: для SUCCEEDED всегда явное завершение на русском. */
function runProgressLine(r: Run): string {
  const st = asRunStatus(r.status);
  const pct = r.progressPct ?? 0;
  const msg = (r.message ?? "").trim();
  if (st === "SUCCEEDED") {
    return `${pct}% — ${msg || "Генерация завершена, файл можно скачать"}`;
  }
  if (st === "FAILED") {
    return `${pct}%${msg ? ` — ${msg}` : " — Сбой генерации"}`;
  }
  return `${pct}%${msg ? ` — ${msg}` : ""}`;
}

function outputFormatLabel(fmt: string | null): string {
  if (!fmt) return "";
  const x = fmt.toLowerCase();
  if (x === "xlsx") return "Excel (XLSX)";
  if (x === "pdf") return "PDF-документ";
  return fmt;
}

function downloadActionLabel(status: Run["status"]): string {
  switch (status) {
    case "SUCCEEDED":
      return "Скачать";
    case "RUNNING":
      return "Формируется…";
    case "QUEUED":
      return "В очереди…";
    case "FAILED":
      return "Не готово";
    default:
      return "Скачать";
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Ошибка запроса (код ${res.status})`);
  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`Ошибка запроса (код ${res.status})`);
  return (await res.json()) as T;
}

type UploadPayload = { uploadId: string; fileName: string };

async function apiUploadCsv(file: File): Promise<UploadPayload> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Ошибка загрузки файла (код ${res.status})`);
  return (await res.json()) as UploadPayload;
}

function IconLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v18M7 8h10M7 16h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
    </svg>
  );
}

function IconReports() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4M9 3v18M9 3h6l4 4v14a2 2 0 01-2 2h-8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 9h4M13 13h4M13 17h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconJournal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 9h8M8 13h5M8 17h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function App() {
  const [reports, setReports] = useState<Report[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  /** "" = все шаблоны; иначе id отчёта для журнала */
  const [runsFilterReportId, setRunsFilterReportId] = useState<string>("");
  const runsFilterRef = useRef(runsFilterReportId);
  runsFilterRef.current = runsFilterReportId;

  const [uploadPayload, setUploadPayload] = useState<UploadPayload | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"xlsx" | "pdf">("xlsx");

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );

  const reportLabel = (reportId: string) =>
    reports.find((r) => r.id === reportId)?.name ?? reportId;

  async function refresh() {
    const filter = runsFilterRef.current;
    const runsUrl =
      filter === ""
        ? "/api/runs?limit=50"
        : `/api/runs?limit=50&reportId=${encodeURIComponent(filter)}`;
    const [r1, r2] = await Promise.all([
      apiGet<{ reports: Report[] }>("/api/reports"),
      apiGet<{ runs: Run[] }>(runsUrl),
    ]);
    setReports(r1.reports);
    setRuns(r2.runs);
    setLastFetchedAt(new Date());
    setSelectedReportId((prev) => {
      if (prev) return prev;
      return r1.reports[0]?.id ?? "";
    });
  }

  function setRunsFilterAndRefresh(value: string) {
    runsFilterRef.current = value;
    setRunsFilterReportId(value);
    void refresh();
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e?.message || e)));
    const t = window.setInterval(() => refresh().catch(() => {}), 1500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setUploadPayload(null);
  }, [selectedReportId]);

  useEffect(() => {
    if (selected) setOutputFormat(selected.defaultFormat);
  }, [selected?.id, selected?.defaultFormat]);

  async function runReport() {
    if (!selected) return;
    if (selected.id === "upload-csv" && !uploadPayload) {
      setError("Сначала выполните загрузку файла (до 5 МБ).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const format =
        selected.supportedFormats.length > 1 ? outputFormat : selected.defaultFormat;
      if (!selected.supportedFormats.includes(format)) {
        setError("Выбранный формат не поддерживается этим шаблоном.");
        return;
      }

      let params: Record<string, unknown>;
      if (selected.id === "sales-xlsx") {
        params = { from: new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10) };
      } else if (selected.id === "weather-pdf") {
        params = { latitude: 55.751244, longitude: 37.618423 };
      } else if (selected.id === "upload-csv") {
        params = {
          uploadId: uploadPayload!.uploadId,
          fileName: uploadPayload!.fileName,
        };
      } else {
        params = {};
      }

      await apiPost<{ runId: string }>(`/api/reports/${selected.id}/runs`, {
        format,
        params,
      });
      await refresh();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="med-app">
      <header className="med-topbar">
        <div className="med-brand">
          <div className="med-logo" aria-hidden>
            <IconLogo />
          </div>
          <div className="med-brand-text">
            <div className="med-brand-title">МедОтчёт</div>
            <div className="med-brand-tag">Платформа отчетов</div>
          </div>
        </div>
        <div className="med-topbar-actions">
          <button
            type="button"
            className="med-btn ghost"
            onClick={() => refresh().catch((e) => setError(String(e?.message || e)))}
            disabled={busy}
            title="Запросить с сервера актуальный каталог отчётов и список запусков (то же делает автообновление журнала)"
          >
            Обновить данные
          </button>
          <div
            className="med-sync-hint"
            title={lastFetchedAt ? lastFetchedAt.toISOString() : undefined}
          >
            {lastFetchedAt
              ? `Обновлено: ${lastFetchedAt.toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : "Загрузка…"}
          </div>
        </div>
      </header>

      <main className="med-main">
        <div className="med-hero">
          <h1>Центр отчётности</h1>
          <p>
            Запускайте формирование отчётов в фоне, отслеживайте статус и получайте готовые файлы для
            документооборота и аналитики.
          </p>
        </div>

        <div className="med-grid">
          <section className="med-card">
            <div className="med-card-title">
              <span className="med-card-title-icon">
                <IconReports />
              </span>
              Каталог отчётов
            </div>
            <div className="med-stack">
              <div className="med-field-select">
                <label className="med-label" htmlFor="report-template">
                  Выберите шаблон
                </label>
                <select
                  id="report-template"
                  className="med-select"
                  value={selectedReportId}
                  onChange={(e) => setSelectedReportId(e.target.value)}
                >
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {selected && (
                <div>
                  <div className="med-desc">{selected.description}</div>
                  <div className="med-meta" style={{ marginTop: 10 }}>
                    Доступные форматы: <b>{selected.supportedFormats.join(", ").toUpperCase()}</b>
                  </div>
                </div>
              )}

              {selected?.id === "upload-csv" && (
                <div className="med-upload-block">
                  <label className="med-label" htmlFor="report-file-input">
                    Загрузка файла
                  </label>
                  <input
                    id="report-file-input"
                    className="med-file-input"
                    type="file"
                    accept=".csv,.txt,.xlsx,.ods,.xods,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet"
                    disabled={uploadBusy || busy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setUploadBusy(true);
                      setError(null);
                      try {
                        const up = await apiUploadCsv(file);
                        setUploadPayload(up);
                      } catch (err: any) {
                        setError(String(err?.message || err));
                        setUploadPayload(null);
                      } finally {
                        setUploadBusy(false);
                      }
                    }}
                  />
                  {uploadBusy && <div className="med-meta">Загрузка файла…</div>}
                  {uploadPayload && (
                    <div className="med-meta">
                      Файл принят: <code>{uploadPayload.fileName}</code>
                    </div>
                  )}
                </div>
              )}

              {selected && selected.supportedFormats.length > 1 && (
                <div className="med-format-row">
                  <span className="med-label" style={{ marginBottom: 0 }}>
                    Формат выгрузки
                  </span>
                  <div className="med-format-toggle">
                    {selected.supportedFormats.includes("xlsx") && (
                      <label className="med-radio">
                        <input
                          type="radio"
                          name="out-fmt"
                          checked={outputFormat === "xlsx"}
                          onChange={() => setOutputFormat("xlsx")}
                        />
                        Excel (XLSX)
                      </label>
                    )}
                    {selected.supportedFormats.includes("pdf") && (
                      <label className="med-radio">
                        <input
                          type="radio"
                          name="out-fmt"
                          checked={outputFormat === "pdf"}
                          onChange={() => setOutputFormat("pdf")}
                        />
                        PDF-документ
                      </label>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                className="med-btn primary"
                onClick={runReport}
                disabled={
                  !selected ||
                  busy ||
                  uploadBusy ||
                  (selected.id === "upload-csv" && !uploadPayload)
                }
              >
                {busy ? "Отправка запроса…" : "Сформировать отчёт"}
              </button>

              {error && <div className="med-error">Ошибка: {error}</div>}
            </div>
          </section>

          <section className="med-card">
            <div className="med-card-title">
              <span className="med-card-title-icon">
                <IconJournal />
              </span>
              Журнал запусков
            </div>
            <div className="med-journal-toolbar">
              <div className="med-field-select med-field-select--grow">
                <label className="med-label" htmlFor="runs-filter-template">
                  Фильтр по шаблону
                </label>
                <select
                  id="runs-filter-template"
                  className="med-select"
                  value={runsFilterReportId}
                  onChange={(e) => setRunsFilterAndRefresh(e.target.value)}
                >
                  <option value="">Все шаблоны</option>
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="med-runs">
              {runs.map((r) => {
                const st = asRunStatus(r.status);
                return (
                <div key={r.id} className="med-run" data-status={st.toLowerCase()}>
                  <div className="med-run-main">
                    <div className="med-run-top">
                      <span className="med-run-title">{reportLabel(r.reportId)}</span>
                      <span className={`med-pill ${st.toLowerCase()}`}>{runStatusLabel(st)}</span>
                      <span className="med-run-time">{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="med-run-id">{r.reportId}</div>
                    {r.outputFormat && (
                      <div className="med-meta" style={{ marginTop: 6 }}>
                        Формат результата: <code>{outputFormatLabel(r.outputFormat)}</code>
                        {r.outputName ? (
                          <>
                            {" "}
                            · <code>{r.outputName}</code>
                          </>
                        ) : null}
                      </div>
                    )}
                    <div className="med-run-bottom">
                      <div className="med-bar">
                        <div className="med-bar-fill" style={{ width: `${r.progressPct}%` }} />
                      </div>
                      <span className="med-run-msg">{runProgressLine(r)}</span>
                      {st === "FAILED" && r.error && (
                        <details>
                          <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: "0.8125rem" }}>
                            Подробности ошибки
                          </summary>
                          <pre className="med-pre">{r.error}</pre>
                        </details>
                      )}
                    </div>
                  </div>
                  <div className="med-run-actions">
                    <a
                      className={`med-btn ${st === "SUCCEEDED" ? "primary" : "disabled"}`}
                      href={st === "SUCCEEDED" ? `/api/runs/${r.id}/download` : undefined}
                      title={
                        st === "SUCCEEDED"
                          ? "Скачать готовый файл"
                          : st === "RUNNING"
                            ? "Дождитесь статуса «Успешно»"
                            : st === "QUEUED"
                              ? "Запуск ожидает воркер"
                              : st === "FAILED"
                                ? "Файл не сформирован"
                                : undefined
                      }
                      onClick={(e) => {
                        if (st !== "SUCCEEDED") e.preventDefault();
                      }}
                    >
                      {downloadActionLabel(st)}
                    </a>
                  </div>
                </div>
              );
              })}
              {!runs.length && (
                <div className="med-empty">
                  {runsFilterReportId
                    ? "Нет запусков для выбранного шаблона. Смените фильтр или сформируйте отчёт."
                    : "Запусков пока нет — выберите отчёт в каталоге и нажмите «Сформировать»."}
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className="med-footer">
          Служебные эндпоинты: <code>/api</code>, загрузка файла: <code>POST /api/uploads</code> ·{" "}
          <code>/health</code>
        </footer>
      </main>
    </div>
  );
}
