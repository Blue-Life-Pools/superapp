import type { ConsumptionFile, ConsumptionImportRow } from './chemicalConsumptionImport';
import { parseSkimmerDosages, pdfTextLines } from './chemicalConsumptionImport';

export async function readConsumptionPdf(file: File, onProgress: (value: string) => void) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await task.promise;
  const lines: string[] = [];
  try {
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const text = await page.getTextContent();
      lines.push(...pdfTextLines(text.items.filter((item): item is Extract<typeof item, { str: string }> => 'str' in item)));
      page.cleanup();
      if (index % 10 === 0) { onProgress(`Leyendo PDF: ${index} de ${document.numPages} páginas`); await new Promise((resolve) => setTimeout(resolve, 0)); }
    }
    return parseSkimmerDosages(lines, file.name);
  } finally { await task.destroy(); }
}
export async function readMonthlyFees(file: File, month: string): Promise<ConsumptionFile> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = unzipSync(bytes, { filter: (entry) => ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels'].includes(entry.name) && entry.originalSize < 5000000 });
  const xml = (data: Uint8Array | undefined) => {
    if (!data) throw new Error('Falta una hoja necesaria del Excel.');
    const document = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
    if (document.querySelector('parsererror')) throw new Error('El archivo Excel no tiene un formato válido.');
    return document;
  };
  const workbook = xml(metadata['xl/workbook.xml']);
  const sheets = Array.from(workbook.getElementsByTagName('sheet'));
  const sheet = sheets.find((item) => item.getAttribute('name') === 'Por Propiedad') || sheets[0];
  if (!sheet) throw new Error('El Excel está vacío.');
  const relationshipId = sheet.getAttribute('r:id');
  const relation = Array.from(xml(metadata['xl/_rels/workbook.xml.rels']).getElementsByTagName('Relationship')).find((item) => item.getAttribute('Id') === relationshipId);
  const target = relation?.getAttribute('Target');
  if (!target) throw new Error('No se encontró la hoja de mensualidades.');
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const content = unzipSync(bytes, { filter: (entry) => [sheetPath, 'xl/sharedStrings.xml'].includes(entry.name) && entry.originalSize < 30000000 });
  const strings = content['xl/sharedStrings.xml'] ? Array.from(xml(content['xl/sharedStrings.xml']).getElementsByTagName('si')).map((item) => Array.from(item.getElementsByTagName('t')).map((node) => node.textContent || '').join('')) : [];
  const sheetRows = Array.from(xml(content[sheetPath]).getElementsByTagName('row')).map((row) => {
    const cells = new Map<string, string>();
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const column = cell.getAttribute('r')?.replace(/\d/g, '') || '';
      const raw = cell.getElementsByTagName('v')[0]?.textContent || '';
      const value = cell.getAttribute('t') === 's' ? strings[Number(raw)] || '' : cell.getAttribute('t') === 'inlineStr' ? cell.getElementsByTagName('t')[0]?.textContent || '' : raw;
      cells.set(column, value);
    }
    return cells;
  });
  const headers = new Map<string, string>();
  sheetRows[0]?.forEach((value, column) => headers.set(value.trim().toLowerCase(), column));
  const propertyColumn = headers.get('propiedad');
  const feeColumn = headers.get('mensualidad');
  const codeColumn = headers.get('codigo') || headers.get('código');
  if (!propertyColumn || !feeColumn) throw new Error('Usa la hoja Por Propiedad o un Excel con columnas Propiedad, Mensualidad y Código (opcional).');
  const rows: ConsumptionImportRow[] = [];
  const names = new Set<string>();
  sheetRows.forEach((row, index) => {
    if (index === 0) return;
    const propertyName = (row.get(propertyColumn) || '').trim();
    if (!propertyName || /^total$/i.test(propertyName)) return;
    const rawFee = row.get(feeColumn);
    if (!rawFee?.trim()) throw new Error(`Falta mensualidad: ${propertyName}.`);
    const monthlyFee = Number(rawFee);
    if (!Number.isFinite(monthlyFee) || monthlyFee < 0) throw new Error(`Mensualidad inválida: ${propertyName}.`);
    if (names.has(propertyName.toLowerCase())) throw new Error(`Propiedad repetida: ${propertyName}. Usa una fila con el total de su mensualidad.`);
    names.add(propertyName.toLowerCase());
    rows.push({ propertyName, monthlyFee, ...(codeColumn && row.get(codeColumn) ? { code: row.get(codeColumn)!.trim() } : {}) });
  });
  if (!rows.length) throw new Error('No se encontraron mensualidades.');
  return { month, sourceName: file.name, rows, warnings: [] };
}
