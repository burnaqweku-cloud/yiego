/* The one safe way to write a spreadsheet file.
   Excel and Google Sheets treat a cell that starts with = + - or @ as a formula, so words typed by a customer
   (a name, a note, an email) could run inside the spreadsheet of whoever opens the export. Such cells get a
   leading apostrophe, which makes the spreadsheet show them as plain text. Plain numbers, including negative
   amounts and +233 phone numbers, are left as they are. */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const csvText = (rows: unknown[][]): string => rows.map((row) => row.map(csvCell).join(",")).join("\n");
