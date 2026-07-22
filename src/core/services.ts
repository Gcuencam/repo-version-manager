import fs from 'node:fs'
import path from 'node:path'
import { hasPackageJson, readPackageVersion } from './config.js'

export interface ServiceCandidate {
  name: string
  hasPackageJson: boolean
  version: string | null
}

const IGNORED = new Set(['node_modules'])

/** First-level directories that are service candidates (excludes hidden dirs and node_modules). */
export function listCandidateDirs(root: string): ServiceCandidate[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !IGNORED.has(entry.name))
    .map((entry) => {
      const dir = path.join(root, entry.name)
      return {
        name: entry.name,
        hasPackageJson: hasPackageJson(dir),
        version: readPackageVersion(dir),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
