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
import {
  type ExpoTargets,
  ROOT_SERVICE,
  detectExpoProject,
  expoTargetsFromConfig,
  readNativeState,
} from '../core/expo.js'
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

/** One line per managed native target: version, build number and sync with the .version file. */
function nativeStatusLines(
  dir: string,
  targets: ExpoTargets,
  expected: string | null,
  nameWidth: number
): string[] {
  const state = readNativeState(detectExpoProject(dir))
  const row = (label: string, version: string | null, build: number | null): string => {
    const name = pc.dim(`· ${label}`.padEnd(nameWidth))
    if (version === null) return `${name}  ${pc.red('version not found')}`
    const buildInfo = build !== null ? pc.dim(` (build ${build})`) : ''
    const sync =
      expected && version !== expected
        ? pc.yellow(`⚠ out of sync (expected v${expected})`)
        : pc.dim('✔ in sync')
    return `${name}  ${pc.green(`v${version}`)}${buildInfo}  ${sync}`
  }
  const lines: string[] = []
  if (targets.android) lines.push(row('android', state.androidVersionName, state.androidVersionCode))
  if (targets.ios) lines.push(row('ios', state.iosVersion, state.iosBuildNumber))
  if (targets.syncAppJson) lines.push(row('app.json', state.appJsonVersion, null))
  return lines
}

export async function statusCommand(): Promise<void> {
  const root = process.cwd()
  p.intro(pc.bgBlue(pc.black(' rpvm status ')))

  const config = readConfig(root)
  if (!config) fail(`${CONFIG_FILE} does not exist. Run ${pc.bold('rpvm init')} first.`)

  const expo = expoTargetsFromConfig(config)
  const nameWidth = Math.max(
    6,
    ...config.services.map((s) => s.length),
    ...(Object.keys(expo).length > 0 ? ['· app.json'.length] : [])
  )
  const lines: string[] = []

  const rootVersion = readVersionFile(root)
  const rootPkgVersion = hasPackageJson(root) ? readPackageVersion(root) : null
  lines.push(`${pc.bold('global'.padEnd(nameWidth))}  ${versionDetail(rootVersion, rootPkgVersion)}`)
  if (expo[ROOT_SERVICE]) {
    lines.push(...nativeStatusLines(root, expo[ROOT_SERVICE], rootVersion, nameWidth))
  }

  if (config.monorepo) {
    for (const name of config.services) {
      const dir = path.join(root, name)
      const version = readVersionFile(dir)
      const pkgVersion = hasPackageJson(dir) ? readPackageVersion(dir) : null
      lines.push(`${pc.cyan(name.padEnd(nameWidth))}  ${versionDetail(version, pkgVersion)}`)
      const targets = expo[name]
      if (targets) lines.push(...nativeStatusLines(dir, targets, version, nameWidth))
    }
  }

  p.note(lines.join('\n'), 'Versions')

  let branchInfo = `main: ${pc.bold(config.mainBranch)} · develop: ${pc.bold(config.developBranch)}`
  if (await isGitRepo(root)) {
    branchInfo += ` · current: ${pc.bold(await currentBranch(root))}`
  }
  p.outro(branchInfo)
}
