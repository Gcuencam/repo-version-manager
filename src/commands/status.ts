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
  if (!config) fail(`${CONFIG_FILE} does not exist. Run ${pc.bold('mvm init')} first.`)

  const nameWidth = Math.max(6, ...config.services.map((s) => s.length))
  const lines: string[] = []

  const globalVersion = readVersionFile(root)
  lines.push(
    `${pc.bold('global'.padEnd(nameWidth))}  ${globalVersion ? pc.green(`v${globalVersion}`) : pc.red('missing .version')}`
  )

  for (const name of config.services) {
    const dir = path.join(root, name)
    const fileVersion = readVersionFile(dir)
    const pkgVersion = hasPackageJson(dir) ? readPackageVersion(dir) : null

    let detail: string
    if (!fileVersion) {
      detail = pc.red('missing .version — run mvm init')
    } else if (pkgVersion && pkgVersion !== fileVersion) {
      detail = `${pc.green(`v${fileVersion}`)}  ${pc.yellow(`⚠ package.json out of sync (v${pkgVersion})`)}`
    } else if (pkgVersion) {
      detail = `${pc.green(`v${fileVersion}`)}  ${pc.dim('✔ package.json in sync')}`
    } else {
      detail = `${pc.green(`v${fileVersion}`)}  ${pc.dim('no package.json')}`
    }
    lines.push(`${pc.cyan(name.padEnd(nameWidth))}  ${detail}`)
  }

  p.note(lines.join('\n'), 'Versions')

  let branchInfo = `main: ${pc.bold(config.mainBranch)} · develop: ${pc.bold(config.developBranch)}`
  if (await isGitRepo(root)) {
    branchInfo += ` · current: ${pc.bold(await currentBranch(root))}`
  }
  p.outro(branchInfo)
}
