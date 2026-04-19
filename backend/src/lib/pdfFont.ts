import path from "node:path";
import fs from "node:fs/promises";

export type PdfCyrillicFontPaths = { regular: string; bold: string };

const NOTO_REG = "NotoSans-Regular.ttf";
const NOTO_BOLD = "NotoSans-Bold.ttf";
const DEJAVU_REG = "DejaVuSans.ttf";
const DEJAVU_BOLD = "DejaVuSans-Bold.ttf";

const SYSTEM_DIRS = [
  process.env.PDF_FONT_DIR,
  "/usr/share/fonts/ttf-dejavu",
  "/usr/share/fonts/TTF",
  "/usr/share/fonts/truetype/dejavu",
].filter(Boolean) as string[];

/** Шрифты с кириллицей для PDFKit (встроенный Helvetica её не рисует). */
export async function resolveCyrillicPdfFonts(): Promise<PdfCyrillicFontPaths | null> {
  if (process.env.PDF_FONT_PATH) {
    const regular = process.env.PDF_FONT_PATH;
    try {
      await fs.access(regular);
      const bold = process.env.PDF_FONT_BOLD_PATH ?? regular;
      return { regular, bold };
    } catch {
      /* fall through */
    }
  }

  const bundledDir = path.join(process.cwd(), "fonts");
  const noto = await tryPair(path.join(bundledDir, NOTO_REG), path.join(bundledDir, NOTO_BOLD));
  if (noto) return noto;

  for (const dir of SYSTEM_DIRS) {
    const dj = await tryPair(path.join(dir, DEJAVU_REG), path.join(dir, DEJAVU_BOLD));
    if (dj) return dj;
  }

  return null;
}

async function tryPair(regular: string, bold: string): Promise<PdfCyrillicFontPaths | null> {
  try {
    await fs.access(regular);
  } catch {
    return null;
  }
  try {
    await fs.access(bold);
    return { regular, bold };
  } catch {
    return { regular, bold: regular };
  }
}
