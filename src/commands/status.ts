import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import {
  CONFIG_FILE,
  hasPackageJson,
  readConfig,
  readPackageVersion,
  readVersionFile,
} from '../core/config.js'
import { currentBranch, isGitRepo } from '../core/git.js'
import { fail } from '../ui.js'

function versionDetail(fileVersion: string | null, pkgVersion: string | null): string {
  if (!fileVersion) return pc.red('missing .version — run rpvm init')
  if (pkgVersion && pkgVersion !== fileVersion) {
    return `${pc.green(`v${fileVersion}`)}  ${pc.yellow(`⚠ package.json out of sync (v${pkgVersion})`)}`
  }
  if (pkgVersion) return `${pc.green(`v${fileVersion}`)}  ${pc.dim('✔ package.json in sync')}`
  return `${pc.green(`v${fileVersion}`)}  ${pc.dim('no package.json')}`
}

export async function statusCommand(): Promise<void> {
  const root = process.cwd()
  p.intro(pc.bgBlue(pc.black(' rpvm status ')))

  const config = readConfig(root)
  if (!config) fail(`${CONFIG_FILE} does not exist. Run ${pc.bold('rpvm init')} first.`)

  const nameWidth = Math.max(6, ...config.services.map((s) => s.length))
  const lines: string[] = []

  const rootPkgVersion = hasPackageJson(root) ? readPackageVersion(root) : null
  lines.push(
    `${pc.bold('global'.padEnd(nameWidth))}  ${versionDetail(readVersionFile(root), rootPkgVersion)}`
  )

  if (config.monorepo) {
    for (const name of config.services) {
      const dir = path.join(root, name)
      const pkgVersion = hasPackageJson(dir) ? readPackageVersion(dir) : null
      lines.push(
        `${pc.cyan(name.padEnd(nameWidth))}  ${versionDetail(readVersionFile(dir), pkgVersion)}`
      )
    }
  }

  p.note(lines.join('\n'), 'Versions')

  let branchInfo = `main: ${pc.bold(config.mainBranch)} · develop: ${pc.bold(config.developBranch)}`
  if (await isGitRepo(root)) {
    branchInfo += ` · current: ${pc.bold(await currentBranch(root))}`
  }
  p.outro(branchInfo)
}
