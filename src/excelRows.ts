import { strFromU8, unzipSync } from 'fflate';

export async function readExcelRows(file: File, preferredSheet?: string) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = unzipSync(bytes, { filter: entry => ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels'].includes(entry.name) && entry.originalSize < 5_000_000 });
  const xml = (data: Uint8Array | undefined) => {
    if (!data) throw new Error('A required Excel worksheet is missing.');
    const document = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
    if (document.querySelector('parsererror')) throw new Error('The Excel file has an invalid format.');
    return document;
  };
  const workbook = xml(metadata['xl/workbook.xml']);
  const sheets = Array.from(workbook.getElementsByTagName('sheet'));
  const sheet = sheets.find(item => item.getAttribute('name') === preferredSheet) || sheets[0];
  if (!sheet) throw new Error('The Excel file is empty.');
  const relationshipId = sheet.getAttribute('r:id');
  const relation = Array.from(xml(metadata['xl/_rels/workbook.xml.rels']).getElementsByTagName('Relationship')).find(item => item.getAttribute('Id') === relationshipId);
  const target = relation?.getAttribute('Target');
  if (!target) throw new Error('The Excel worksheet was not found.');
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const content = unzipSync(bytes, { filter: entry => [sheetPath, 'xl/sharedStrings.xml'].includes(entry.name) && entry.originalSize < 30_000_000 });
  const text = (element: Element) => Array.from(element.getElementsByTagName('t')).map(node => node.textContent || '').join('');
  const strings = content['xl/sharedStrings.xml'] ? Array.from(xml(content['xl/sharedStrings.xml']).getElementsByTagName('si')).map(text) : [];
  const rows = Array.from(xml(content[sheetPath]).getElementsByTagName('row')).map(row => {
    const cells = new Map<string, string>();
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const column = cell.getAttribute('r')?.replace(/\d/g, '') || '';
      const raw = cell.getElementsByTagName('v')[0]?.textContent || '';
      const type = cell.getAttribute('t');
      cells.set(column, type === 's' ? strings[Number(raw)] || '' : type === 'inlineStr' ? text(cell) : raw);
    }
    return cells;
  });
  const date1904 = workbook.getElementsByTagName('workbookPr')[0]?.getAttribute('date1904');
  return { rows, date1904: date1904 === 'true' || date1904 === '1' };
}
