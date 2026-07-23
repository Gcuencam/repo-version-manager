import fs from 'node:fs'
import path from 'node:path'
import { hasPackageJson, readPackageVersion } from './config.js'

export interface ServiceCandidate {
  name: string
  hasPackageJson: boolean
  version: string | null
  hasSubdirs: boolean
}

const IGNORED = new Set(['node_modules'])

const isCandidateEntry = (entry: fs.Dirent): boolean =>
  entry.isDirectory() && !entry.name.startsWith('.') && !IGNORED.has(entry.name)

function hasCandidateSubdirs(dir: string): boolean {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).some(isCandidateEntry)
  } catch {
    return false
  }
}

/** First-level directories that are service candidates (excludes hidden dirs and node_modules). */
export function listCandidateDirs(root: string): ServiceCandidate[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(isCandidateEntry)
    .map((entry) => {
      const dir = path.join(root, entry.name)
      return {
        name: entry.name,
        hasPackageJson: hasPackageJson(dir),
        version: readPackageVersion(dir),
        hasSubdirs: hasCandidateSubdirs(dir),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
