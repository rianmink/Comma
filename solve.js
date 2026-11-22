// csv-reader 1.0.0, same answers, faster. Delimiters are found with indexOf.
// A character walk runs only for a quoted field that contains a line break.

/**
 * @param {{ text: unknown, header: unknown }} input
 * @returns {{ columns: string[] | null, rows: string[][], errors: object[] }}
 */
export function run(input) {
  const text = typeof input.text === 'string' ? input.text : String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let i = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1;

  let nextNL = text.indexOf('\n', i);
  let nextCR = text.indexOf('\r', i);

  let value = '';
  let added = 0;

  const sync = () => {
    if (nextNL >= 0 && nextNL < i) nextNL = text.indexOf('\n', i);
    if (nextCR >= 0 && nextCR < i) nextCR = text.indexOf('\r', i);
  };

  // text[from, to) with each CR / CRLF / LF written as LF.
  const normalize = (from, to) => {
    if (from >= to) return { s: '', lines: 0 };
    const parts = [];
    let p = from;
    let lines = 0;
    while (p < to) {
      let nl = text.indexOf('\n', p);
      if (nl < 0 || nl >= to) nl = to;
      let cr = text.indexOf('\r', p);
      if (cr < 0 || cr >= to) cr = to;
      if (nl === to && cr === to) {
        parts.push(text.slice(p, to));
        break;
      }
      const br = cr < nl ? cr : nl;
      if (br > p) parts.push(text.slice(p, br));
      parts.push('\n');
      lines += 1;
      p = text.charCodeAt(br) === 13 && br + 1 < to && text.charCodeAt(br + 1) === 10 ? br + 2 : br + 1;
    }
    return { s: parts.length === 1 ? parts[0] : parts.join(''), lines };
  };

  // Unquoted scan. prefix is prepended (already-built quoted text, or '"').
  // Sets value and added (chars kept from this scan only).
  const readUnquoted = (prefix) => {
    sync();
    let acc = prefix;
    let dirty = prefix !== '';
    let add = 0;
    while (i < n) {
      const comma = text.indexOf(',', i);
      let end = n;
      let kind = 3; // 0 comma, 1 LF, 3 EOF, 4 CRLF, 2 stray CR
      if (comma >= 0) {
        end = comma;
        kind = 0;
      }
      if (nextNL >= 0 && nextNL < end) {
        end = nextNL;
        kind = 1;
      }
      if (nextCR >= 0 && nextCR < end) {
        end = nextCR;
        kind = 2;
      }
      if (kind === 2 && end + 1 < n && text.charCodeAt(end + 1) === 10) kind = 4;

      if (kind === 2) {
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (end > i) {
          const s = text.slice(i, end);
          acc = dirty ? acc + s : s;
          dirty = true;
          add += end - i;
        }
        i = end + 1;
        nextCR = text.indexOf('\r', i);
        continue;
      }

      const mid = end > i ? text.slice(i, end) : '';
      value = !dirty ? mid : mid === '' ? acc : acc + mid;
      added = add + (end > i ? end - i : 0);
      if (kind === 0) {
        i = end + 1;
        return 0;
      }
      if (kind === 1) {
        i = end + 1;
        line += 1;
        nextNL = text.indexOf('\n', i);
        if (nextCR >= 0 && nextCR < i) nextCR = text.indexOf('\r', i);
        return 1;
      }
      if (kind === 4) {
        i = end + 2;
        line += 1;
        nextCR = text.indexOf('\r', i);
        nextNL = text.indexOf('\n', i);
        return 1;
      }
      i = end;
      return 2;
    }
    value = dirty ? acc : '';
    added = add;
    return 2;
  };

  const readQuoted = () => {
    const open = i;
    const openLine = line;
    const saveNL = nextNL;
    const saveCR = nextCR;
    let j = i + 1;
    let acc = null;
    while (true) {
      if (nextNL >= 0 && nextNL < j) nextNL = text.indexOf('\n', j);
      if (nextCR >= 0 && nextCR < j) nextCR = text.indexOf('\r', j);
      const q = text.indexOf('"', j);
      if (q < 0) {
        i = open + 1;
        line = openLine;
        nextNL = saveNL;
        nextCR = saveCR;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      const doubled = q + 1 < n && text.charCodeAt(q + 1) === 34;
      const limit = doubled ? q + 1 : q;
      const nlInside = nextNL >= j && nextNL < limit;
      const crInside = nextCR >= j && nextCR < limit;
      if (!nlInside && !crInside) {
        const s = j === limit ? '' : text.slice(j, limit);
        acc = acc === null ? s : s === '' ? acc : acc + s;
      } else {
        const norm = normalize(j, limit);
        line += norm.lines;
        acc = acc === null ? norm.s : norm.s === '' ? acc : acc + norm.s;
      }
      if (doubled) {
        j = q + 2;
        continue;
      }
      value = acc === null ? '' : acc;
      i = q + 1;
      break;
    }
    sync();
    if (i >= n) return 2;
    const d = text.charCodeAt(i);
    if (d === 44) {
      i += 1;
      return 0;
    }
    if (d === 10) {
      i += 1;
      line += 1;
      nextNL = text.indexOf('\n', i);
      if (nextCR >= 0 && nextCR < i) nextCR = text.indexOf('\r', i);
      return 1;
    }
    if (d === 13 && i + 1 < n && text.charCodeAt(i + 1) === 10) {
      i += 2;
      line += 1;
      nextCR = text.indexOf('\r', i);
      nextNL = text.indexOf('\n', i);
      return 1;
    }
    const ended = readUnquoted(value);
    if (added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return ended;
  };

  let recordLine = 1;
  let recordRow = null;

  while (i < n) {
    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    let ended = 0;
    do {
      if (i < n && text.charCodeAt(i) === 34) {
        lastQuoted = true;
        ended = readQuoted();
      } else {
        lastQuoted = false;
        ended = readUnquoted('');
      }
      fields.push(value);
    } while (ended === 0);

    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    const fl = fields.length;
    if (fl < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fl });
      for (let k = fl; k < width; k++) fields.push('');
    } else if (fl > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
