import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type Celda = string | number | null;

export interface Hoja {
  nombre: string;
  columnas: string[];
  filas: Celda[][];
}

export interface Seccion {
  nombre: string;
  columnas: string[];
  filas: Celda[][];
}

const MARGIN = 14;
const HEAD_FILL: [number, number, number] = [60, 45, 15];
const HEAD_TEXT: [number, number, number] = [255, 255, 255];
const ALT_FILL: [number, number, number]  = [252, 248, 240];

const EC_TZ = 'America/Guayaquil';

/** Fecha en hora Ecuador, formato dd/mm/aaaa hh:mm */
export function fmtFecha(iso: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: EC_TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`;
}

/** Fecha de hoy en Ecuador, formato YYYY-MM-DD */
export function fechaHoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: EC_TZ }).format(new Date());
}

/**
 * Construye los límites ISO con offset UTC-5 para un rango de fechas locales (Ecuador).
 * Úsalo en TODOS los .gte/.lte sobre pedidoCreadoEn para evitar el drift de zona horaria.
 */
export function rangoUTC(desde: string, hasta: string): { gte: string; lte: string } {
  return {
    gte: `${desde}T00:00:00-05:00`,
    lte: `${hasta}T23:59:59.999-05:00`,
  };
}

/**
 * Genera un archivo .xlsx con una hoja por entrada en `hojas`.
 * Los valores numéricos se guardan como número (no texto) para que Excel los sume.
 */
export async function exportarExcel(nombreArchivo: string, hojas: Hoja[]): Promise<void> {
  if (hojas.every(h => h.filas.length === 0)) throw new Error('Sin datos para exportar.');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Restaurante San Pedro';
  wb.created = new Date();

  for (const hoja of hojas) {
    const ws = wb.addWorksheet(hoja.nombre.slice(0, 31));

    const headerRow = ws.addRow(hoja.columnas);
    headerRow.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3C2D0F' } };

    for (const fila of hoja.filas) {
      ws.addRow(fila);
    }

    ws.columns.forEach((col, i) => {
      const maxLen = Math.max(
        (hoja.columnas[i] ?? '').length,
        ...hoja.filas.map(r => String(r[i] ?? '').length)
      );
      col.width = Math.min(Math.max(maxLen + 2, 10), 50);
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Genera un PDF A4 con encabezado "Restaurante San Pedro", KPIs opcionales
 * y una tabla por sección. Los montos en `filas` deben venir ya formateados con $.
 * El nombre del archivo se deriva de `titulo` + fecha de hoy.
 */
export function exportarPDF(
  titulo: string,
  subtitulo: string,
  secciones: Seccion[],
  kpis?: { label: string; valor: string }[]
): void {
  const conDatos = secciones.filter(s => s.filas.length > 0);
  if (!kpis?.length && conDatos.length === 0) throw new Error('Sin datos para exportar.');

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.width;
  const ahora = fmtFecha(new Date().toISOString());
  let y = MARGIN;

  const headStyles    = { fillColor: HEAD_FILL, textColor: HEAD_TEXT, fontStyle: 'bold' as const, fontSize: 8 };
  const altRowStyles  = { fillColor: ALT_FILL };

  // ── Encabezado ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(140, 100, 20);
  doc.text('RESTAURANTE SAN PEDRO', MARGIN, y);
  y += 7;

  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text(titulo, MARGIN, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(subtitulo, MARGIN, y);
  y += 4;

  doc.setDrawColor(180, 140, 40);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 8;

  // ── KPIs ──
  if (kpis?.length) {
    autoTable(doc, {
      startY: y,
      head: [['Indicador', 'Valor']],
      body: kpis.map(k => [k.label, k.valor]),
      margin: { left: MARGIN, right: MARGIN, bottom: 16 },
      headStyles,
      alternateRowStyles: altRowStyles,
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' as const } },
      theme: 'striped',
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // ── Secciones ──
  for (const sec of conDatos) {
    if (y > doc.internal.pageSize.height - 60) { doc.addPage(); y = MARGIN; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(80, 60, 20);
    doc.text(sec.nombre, MARGIN, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [sec.columnas],
      body: sec.filas.map(r => r.map(c => c ?? '')) as (string | number)[][],
      margin: { left: MARGIN, right: MARGIN, bottom: 16 },
      headStyles,
      alternateRowStyles: altRowStyles,
      bodyStyles: { fontSize: 8 },
      theme: 'striped',
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // ── Pie en todas las páginas ──
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(160);
    doc.text(
      `Restaurante San Pedro  |  Generado: ${ahora}  |  Página ${p} de ${totalPaginas}`,
      MARGIN,
      doc.internal.pageSize.height - 8
    );
  }

  doc.save(`${titulo.replace(/\s+/g, '_')}_${fechaHoy()}.pdf`);
}
