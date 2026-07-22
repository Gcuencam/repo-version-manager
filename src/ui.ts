import * as p from '@clack/prompts'
import pc from 'picocolors'

/** Unwraps a clack prompt result; if the user cancels (Ctrl+C), exits cleanly. */
export function must<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Operation cancelled.')
    process.exit(0)
  }
  return value as T
}

export function fail(message: string): never {
  p.log.error(pc.red(message))
  p.outro(pc.red('Aborted: nothing has been modified.'))
  process.exit(1)
}

export function versionArrow(from: string, to: string): string {
  if (from === to) return `${pc.dim(from)} ${pc.dim('(unchanged)')}`
  return `${pc.dim(from)} → ${pc.green(pc.bold(to))}`
}

export interface SummaryRow {
  name: string
  from: string
  to: string
}

export function summaryTable(rows: SummaryRow[]): string {
  const nameWidth = Math.max(...rows.map((row) => row.name.length))
  return rows
    .map((row) => `${pc.cyan(row.name.padEnd(nameWidth))}  ${versionArrow(row.from, row.to)}`)
    .join('\n')
}

export const semverHint = 'Invalid semver version (e.g. 1.2.3)'
