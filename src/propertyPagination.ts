export function paginateProperties<T>(rows: T[], requestedPage: number, requestedSize = 24) {
  const pageSize = [12, 24, 48].includes(requestedSize) ? requestedSize : 24;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), page, pageCount, pageSize, total: rows.length, from: rows.length ? start + 1 : 0, to: Math.min(start + pageSize, rows.length) };
}
