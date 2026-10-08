export function toCsv(rows) {
  return '\ufeff' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    // Prevent formulas in spreadsheets, including whitespace-prefixed formulas.
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
