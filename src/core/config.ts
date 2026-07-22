import fs from 'node:fs'
import path from 'node:path'

export const CONFIG_FILE = '.rvmrc.json'
export const VERSION_FILE = '.version'

export interface RvmConfig {
  monorepo: boolean
  mainBranch: string
  developBranch: string
  services: string[]
}

export function readConfig(root: string): RvmConfig | null {
  const file = path.join(root, CONFIG_FILE)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8')) as RvmConfig
}

export function writeConfig(root: string, config: RvmConfig): void {
  fs.writeFileSync(path.join(root, CONFIG_FILE), JSON.stringify(config, null, 2) + '\n')
}

export function readVersionFile(dir: string): string | null {
  const file = path.join(dir, VERSION_FILE)
  if (!fs.existsSync(file)) return null
  const value = fs.readFileSync(file, 'utf8').trim()
  return value || null
}

export function writeVersionFile(dir: string, version: string): void {
  fs.writeFileSync(path.join(dir, VERSION_FILE), version + '\n')
}

export function hasPackageJson(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'package.json'))
}

export function readPackageVersion(dir: string): string | null {
  const file = path.join(dir, 'package.json')
  if (!fs.existsSync(file)) return null
  try {
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: string }
    return pkg.version ?? null
  } catch {
    return null
  }
}

/** Updates "version" in package.json preserving indentation and the trailing newline. */
export function updatePackageVersion(dir: string, version: string): void {
  const file = path.join(dir, 'package.json')
  const raw = fs.readFileSync(file, 'utf8')
  const indentMatch = raw.match(/^([ \t]+)"/m)
  const indent = indentMatch ? indentMatch[1]! : 2
  const pkg = JSON.parse(raw) as Record<string, unknown>
  pkg.version = version
  const trailingNewline = raw.endsWith('\n') ? '\n' : ''
  fs.writeFileSync(file, JSON.stringify(pkg, null, indent) + trailingNewline)
}
