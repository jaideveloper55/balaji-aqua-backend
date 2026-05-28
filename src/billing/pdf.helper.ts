import PDFDocument from 'pdfkit';
import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

// ─── Brand ─────────────────────────────────────────────────────────────────
const BRAND = {
  name: 'Balaji Aqua',
  tagline: 'Water Plant ERP',
  primary: '#2563eb',
  primarySoft: '#dbeafe',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  zebra: '#f8fafc',
};

// ─── Fonts ─────────────────────────────────────────────────────────────────
// Drop NotoSans-Regular.ttf + NotoSans-Bold.ttf into src/billing/fonts/
// for the ₹ symbol. Without them we fall back to Helvetica + "Rs."
const FONT_DIR = path.join(__dirname, 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'NotoSans-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'NotoSans-Bold.ttf');
const HAS_UNICODE_FONT =
  fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);

const FONT = {
  regular: HAS_UNICODE_FONT ? 'AppRegular' : 'Helvetica',
  bold: HAS_UNICODE_FONT ? 'AppBold' : 'Helvetica-Bold',
};
export const CURRENCY_SYMBOL = HAS_UNICODE_FONT ? '₹' : 'Rs.';

const logger = new Logger('PdfHelper');
if (!HAS_UNICODE_FONT) {
  logger.warn(
    `NotoSans font not found at ${FONT_DIR}. Falling back to Helvetica + "Rs." for currency. Drop NotoSans-Regular.ttf and NotoSans-Bold.ttf into that folder to enable ₹.`,
  );
}

// ─── PUBLIC: currency formatter ────────────────────────────────────────────
// IMPORTANT: use this everywhere money is rendered into a PDF — never hardcode ₹.
// When the unicode font is missing, this swaps to "Rs." automatically.
export function formatPdfCurrency(value: number): string {
  return `${CURRENCY_SYMBOL}${value.toLocaleString('en-IN')}`;
}

export interface PdfColumn {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  isCurrency?: boolean;
  isStatus?: boolean;
}

export interface BuildPdfOptions {
  title: string;
  subtitle?: string;
  periodLabel?: string;
  columns: PdfColumn[];
  rows: (string | number)[][];
  summary?: { label: string; value: string }[];
  orientation?: 'portrait' | 'landscape';
}

// ─── Status pill colors ────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  PAID: { bg: '#dcfce7', fg: '#15803d' },
  PARTIAL: { bg: '#fef3c7', fg: '#a16207' },
  PENDING: { bg: '#dbeafe', fg: '#1d4ed8' },
  CONFIRMED: { bg: '#dbeafe', fg: '#1d4ed8' },
  OVERDUE: { bg: '#fee2e2', fg: '#b91c1c' },
  CANCELLED: { bg: '#f1f5f9', fg: '#475569' },
  HIGH: { bg: '#fee2e2', fg: '#b91c1c' },
  MEDIUM: { bg: '#fef3c7', fg: '#a16207' },
  RECENT: { bg: '#dcfce7', fg: '#15803d' },
};
const STATUS_DEFAULT = { bg: '#f1f5f9', fg: '#475569' };

// ─── Layout constants ──────────────────────────────────────────────────────
const PAGE_MARGIN = 40;
const BOTTOM_MARGIN = 60; // reserved for the footer
const SUMMARY_TOP_GAP = 24; // air between table and KPI cards
const SUMMARY_BOTTOM_GAP = 20; // air between KPI cards and footer
const SUMMARY_CARD_HEIGHT = 54;
const SUMMARY_BLOCK_HEIGHT =
  SUMMARY_TOP_GAP + SUMMARY_CARD_HEIGHT + SUMMARY_BOTTOM_GAP;

@Injectable()
export class PdfHelper {
  async generate(opts: BuildPdfOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: opts.orientation ?? 'landscape',
        // Set top/left/right margin but ZERO bottom margin. PDFKit auto-paginates
        // when y > pageHeight - bottomMargin; we don't want that — we manage
        // page breaks ourselves via ensureRoom() and drawTable()'s break check.
        // The visual bottom margin (for the footer) is enforced manually via
        // BOTTOM_MARGIN below.
        margins: {
          top: PAGE_MARGIN,
          left: PAGE_MARGIN,
          right: PAGE_MARGIN,
          bottom: 0,
        },
        bufferPages: true,
        autoFirstPage: true,
        info: {
          Title: opts.title,
          Author: BRAND.name,
          Subject: opts.subtitle ?? opts.title,
          Creator: `${BRAND.name} ERP`,
        },
      });

      if (HAS_UNICODE_FONT) {
        doc.registerFont('AppRegular', FONT_REGULAR);
        doc.registerFont('AppBold', FONT_BOLD);
      }

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - PAGE_MARGIN * 2;
      const leftEdge = PAGE_MARGIN;

      this.drawHeader(doc, opts, leftEdge, pageWidth);
      this.drawTable(doc, opts.columns, opts.rows, leftEdge);

      // Snapshot page count just before summary. drawSummary should not add
      // any pages because ensureRoom() already provided enough room.
      // If PDFKit auto-paginates anyway, we trim back to this count.
      let expectedPageCount = doc.bufferedPageRange().count;

      if (opts.summary && opts.summary.length > 0) {
        this.ensureRoom(doc, SUMMARY_BLOCK_HEIGHT);
        // After ensureRoom, count may have grown by 1 — that's legitimate.
        expectedPageCount = doc.bufferedPageRange().count;
        this.drawSummary(doc, opts.summary, leftEdge, pageWidth);
      }

      // Trim any pages PDFKit silently added during drawSummary or earlier.
      const actualPageCount = doc.bufferedPageRange().count;
      if (actualPageCount > expectedPageCount) {
        logger.warn(
          `PDFKit auto-added ${actualPageCount - expectedPageCount} phantom page(s); trimming.`,
        );
        this.trimTrailingBlankPages(doc, expectedPageCount);
      }

      this.drawFooters(doc, opts.title);

      doc.end();
    });
  }

  // ─── Guarantee `height` points of vertical room without auto-paging ──────
  // If we're too close to the bottom, add ONE explicit page break.
  // Without this, drawing into the bottom-margin zone causes PDFKit to
  // silently insert pages — which is where the trailing blanks come from.
  private ensureRoom(doc: PDFKit.PDFDocument, height: number) {
    const bottomLimit = doc.page.height - BOTTOM_MARGIN;
    if (doc.y + height > bottomLimit) {
      doc.addPage();
      doc.y = PAGE_MARGIN;
    }
  }

  // ─── Remove phantom blank pages PDFKit may have auto-appended ────────────
  // PDFKit can silently add pages when text/fill calls push past page edges,
  // even with margins.bottom = 0 and lineBreak: false. After all legitimate
  // drawing is done, we trim anything past `keepCount` from the internal
  // page buffer. There's no public API for this; we manipulate _pageBuffer
  // directly. Safe because pages are popped before doc.end() serializes them.
  private trimTrailingBlankPages(doc: PDFKit.PDFDocument, keepCount: number) {
    const anyDoc = doc as any;
    if (!Array.isArray(anyDoc._pageBuffer)) return;

    while (anyDoc._pageBuffer.length > keepCount) {
      anyDoc._pageBuffer.pop();
    }

    // Switch to the last kept page so any further operations
    // (footer stamping) land on real content pages, not the popped ones.
    if (keepCount > 0) {
      doc.switchToPage(keepCount - 1);
    }
  }

  // ─── Header ────────────────────────────────────────────────────────────
  private drawHeader(
    doc: PDFKit.PDFDocument,
    opts: BuildPdfOptions,
    x: number,
    width: number,
  ) {
    doc
      .fillColor(BRAND.primary)
      .fontSize(16)
      .font(FONT.bold)
      .text(BRAND.name, x, 40, { lineBreak: false });

    doc
      .fillColor(BRAND.muted)
      .fontSize(9)
      .font(FONT.regular)
      .text(BRAND.tagline, x, 58, { lineBreak: false });

    const generatedAt = `Generated: ${new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })}`;
    doc.fillColor(BRAND.muted).fontSize(8).text(generatedAt, x, 40, {
      width,
      align: 'right',
      lineBreak: false,
    });

    doc
      .moveTo(x, 80)
      .lineTo(x + width, 80)
      .strokeColor(BRAND.border)
      .lineWidth(0.5)
      .stroke();

    doc
      .fillColor(BRAND.text)
      .fontSize(18)
      .font(FONT.bold)
      .text(opts.title, x, 95, { lineBreak: false });

    let subY = 118;
    if (opts.subtitle) {
      doc
        .fillColor(BRAND.muted)
        .fontSize(10)
        .font(FONT.regular)
        .text(opts.subtitle, x, subY, { lineBreak: false });
      subY += 14;
    }
    if (opts.periodLabel) {
      doc
        .fillColor(BRAND.muted)
        .fontSize(10)
        .text(`Period: ${opts.periodLabel}`, x, subY, { lineBreak: false });
      subY += 14;
    }

    doc.y = subY + 12;
  }

  // ─── Table ─────────────────────────────────────────────────────────────
  private drawTable(
    doc: PDFKit.PDFDocument,
    columns: PdfColumn[],
    rows: (string | number)[][],
    x: number,
  ) {
    const rowHeight = 24;
    const headerHeight = 28;
    const tableWidth = columns.reduce((s, c) => s + c.width, 0);
    let cursorY = doc.y;

    const drawHeaderRow = () => {
      doc
        .rect(x, cursorY, tableWidth, headerHeight)
        .fillColor(BRAND.primary)
        .fill();

      let colX = x;
      doc.fillColor('#ffffff').fontSize(9).font(FONT.bold);
      columns.forEach((col) => {
        doc.text(col.header, colX + 8, cursorY + 10, {
          width: col.width - 16,
          align: col.align ?? 'left',
          lineBreak: false,
        });
        colX += col.width;
      });
      cursorY += headerHeight;
    };

    drawHeaderRow();
    doc.font(FONT.regular).fontSize(8.5);

    rows.forEach((row, rowIdx) => {
      // Page break check
      if (cursorY + rowHeight > doc.page.height - BOTTOM_MARGIN) {
        doc.addPage();
        cursorY = PAGE_MARGIN;
        drawHeaderRow();
        doc.font(FONT.regular).fontSize(8.5);
      }

      if (rowIdx % 2 === 0) {
        doc
          .rect(x, cursorY, tableWidth, rowHeight)
          .fillColor(BRAND.zebra)
          .fill();
      }

      let cX = x;
      row.forEach((cell, i) => {
        const col = columns[i];

        if (col.isStatus && cell) {
          this.drawStatusPill(doc, String(cell), cX, cursorY, col);
        } else {
          const text =
            col.isCurrency && typeof cell === 'number'
              ? formatPdfCurrency(cell)
              : String(cell ?? '');

          doc.fillColor(BRAND.text).font(FONT.regular).fontSize(8.5);
          doc.text(text, cX + 8, cursorY + 8, {
            width: col.width - 16,
            align: col.align ?? 'left',
            lineBreak: false,
            ellipsis: true,
          });
        }
        cX += col.width;
      });

      doc
        .moveTo(x, cursorY + rowHeight)
        .lineTo(x + tableWidth, cursorY + rowHeight)
        .strokeColor(BRAND.border)
        .lineWidth(0.3)
        .stroke();

      cursorY += rowHeight;
    });

    // CRITICAL: set doc.y precisely so the summary block knows where to land.
    // Don't add extra padding here — ensureRoom() will add a page break
    // if there isn't enough space below.
    doc.y = cursorY + 10;
  }

  // ─── Status pill ───────────────────────────────────────────────────────
  private drawStatusPill(
    doc: PDFKit.PDFDocument,
    rawStatus: string,
    colX: number,
    rowY: number,
    col: PdfColumn,
  ) {
    const status = rawStatus.toUpperCase().trim();
    const style = STATUS_STYLES[status] ?? STATUS_DEFAULT;
    const display =
      status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

    doc.font(FONT.bold).fontSize(8);
    const textWidth = doc.widthOfString(display);
    const pillWidth = Math.min(textWidth + 14, col.width - 8);
    const pillHeight = 14;

    const cellCenter = colX + col.width / 2;
    const pillX = cellCenter - pillWidth / 2;
    const pillY = rowY + 5;

    doc
      .roundedRect(pillX, pillY, pillWidth, pillHeight, 7)
      .fillColor(style.bg)
      .fill();

    doc
      .fillColor(style.fg)
      .font(FONT.bold)
      .fontSize(8)
      .text(display, pillX, pillY + 3, {
        width: pillWidth,
        align: 'center',
        lineBreak: false,
      });
  }

  // ─── Summary (KPI cards) ───────────────────────────────────────────────
  private drawSummary(
    doc: PDFKit.PDFDocument,
    summary: { label: string; value: string }[],
    x: number,
    width: number,
  ) {
    const blockY = doc.y + SUMMARY_TOP_GAP;
    const cardWidth = (width - (summary.length - 1) * 8) / summary.length;
    const cardHeight = SUMMARY_CARD_HEIGHT;

    summary.forEach((item, i) => {
      const cardX = x + i * (cardWidth + 8);

      doc
        .roundedRect(cardX, blockY, cardWidth, cardHeight, 6)
        .fillColor(BRAND.zebra)
        .fill();

      doc.rect(cardX, blockY, 3, cardHeight).fillColor(BRAND.primary).fill();

      // Save/restore around text so PDFKit's `y` cursor doesn't leak past
      // page bottom and trigger auto-pagination after the last card.
      doc.save();

      doc
        .fillColor(BRAND.muted)
        .fontSize(8)
        .font(FONT.bold)
        .text(item.label.toUpperCase(), cardX + 12, blockY + 10, {
          width: cardWidth - 20,
          characterSpacing: 0.5,
          lineBreak: false,
          height: 12,
        });

      doc
        .fillColor(BRAND.text)
        .fontSize(14)
        .font(FONT.bold)
        .text(item.value, cardX + 12, blockY + 26, {
          width: cardWidth - 20,
          lineBreak: false,
          height: 20,
        });

      doc.restore();
    });

    doc.y = blockY + cardHeight + SUMMARY_BOTTOM_GAP;
  }

  // ─── Footers ───────────────────────────────────────────────────────────
  // CRITICAL: each footer text call is wrapped in save/restore so that
  // PDFKit's internal `y` cursor cannot leak out and trigger auto-pagination.
  // Without save/restore, calling `doc.text()` near the bottom edge bumps
  // doc.y past the page boundary, and PDFKit silently appends a blank page.
  private drawFooters(doc: PDFKit.PDFDocument, reportTitle: string) {
    const range = doc.bufferedPageRange();
    const total = range.count;
    const footerY = doc.page.height - 24;

    for (let i = range.start; i < range.start + total; i++) {
      doc.switchToPage(i);
      const pageNum = i - range.start + 1;

      // Save graphics state, draw footer text positioned absolutely, restore.
      // The restore() resets doc.y back to its pre-footer value so PDFKit
      // never sees a y-coordinate past the page boundary.
      doc.save();

      doc
        .fillColor(BRAND.muted)
        .fontSize(8)
        .font(FONT.regular)
        .text(`${BRAND.name} • ${reportTitle}`, PAGE_MARGIN, footerY, {
          width: (doc.page.width - PAGE_MARGIN * 2) / 2,
          align: 'left',
          lineBreak: false,
          height: 12, // explicit height stops flow-advance
        });

      doc.text(`Page ${pageNum} of ${total}`, PAGE_MARGIN, footerY, {
        width: doc.page.width - PAGE_MARGIN * 2,
        align: 'right',
        lineBreak: false,
        height: 12,
      });

      doc.restore();
    }
  }
}
