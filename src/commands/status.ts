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

export async function statusCommand(): Promise<void> {
  const root = process.cwd()
  p.intro(pc.bgBlue(pc.black(' mvm status ')))

  const config = readConfig(root)
  if (!config) fail(`No existe ${CONFIG_FILE}. Ejecuta primero ${pc.bold('mvm init')}.`)

  const nameWidth = Math.max(6, ...config.services.map((s) => s.length))
  const lines: string[] = []

  const globalVersion = readVersionFile(root)
  lines.push(
    `${pc.bold('global'.padEnd(nameWidth))}  ${globalVersion ? pc.green(`v${globalVersion}`) : pc.red('sin .version')}`
  )

  for (const name of config.services) {
    const dir = path.join(root, name)
    const fileVersion = readVersionFile(dir)
    const pkgVersion = hasPackageJson(dir) ? readPackageVersion(dir) : null

    let detail: string
    if (!fileVersion) {
      detail = pc.red('sin .version — ejecuta mvm init')
    } else if (pkgVersion && pkgVersion !== fileVersion) {
      detail = `${pc.green(`v${fileVersion}`)}  ${pc.yellow(`⚠ package.json desincronizado (v${pkgVersion})`)}`
    } else if (pkgVersion) {
      detail = `${pc.green(`v${fileVersion}`)}  ${pc.dim('✔ package.json en sync')}`
    } else {
      detail = `${pc.green(`v${fileVersion}`)}  ${pc.dim('sin package.json')}`
    }
    lines.push(`${pc.cyan(name.padEnd(nameWidth))}  ${detail}`)
  }

  p.note(lines.join('\n'), 'Versiones')

  let branchInfo = `principal: ${pc.bold(config.mainBranch)} · desarrollo: ${pc.bold(config.developBranch)}`
  if (await isGitRepo(root)) {
    branchInfo += ` · actual: ${pc.bold(await currentBranch(root))}`
  }
  p.outro(branchInfo)
}
