// Split a SQL script into single statements for Prisma's prepared-statement protocol.
// Dollar quotes, strings, and comments are not split on their internal semicolons.

export function splitSql(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  let dollar: string | null = null

  while (i < sql.length) {
    const rest = sql.slice(i)

    if (dollar) {
      if (rest.startsWith(dollar)) {
        current += dollar
        i += dollar.length
        dollar = null
      } else {
        current += sql[i]
        i += 1
      }
      continue
    }

    if (rest.startsWith('--')) {
      const nl = sql.indexOf('\n', i)
      i = nl === -1 ? sql.length : nl + 1
      continue
    }

    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2)
      if (end === -1) throw new Error('Unclosed block comment in SQL script')
      i = end + 2
      continue
    }

    if (sql[i] === "'") {
      current += "'"
      i += 1
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += "''"
          i += 2
          continue
        }
        current += sql[i]
        const closed = sql[i] === "'"
        i += 1
        if (closed) break
      }
      continue
    }

    const dollarMatch = /^\$[A-Za-z0-9_]*\$/.exec(rest)
    if (sql[i] === '$' && dollarMatch) {
      dollar = dollarMatch[0]
      current += dollar
      i += dollar.length
      continue
    }

    if (sql[i] === ';') {
      const statement = current.trim()
      if (statement) statements.push(statement)
      current = ''
      i += 1
      continue
    }

    current += sql[i]
    i += 1
  }

  if (dollar) throw new Error('Unclosed dollar quote in SQL script')
  const tail = current.trim()
  if (tail) statements.push(tail)
  return statements
}
