import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import {
  CONFIG_FILE,
  VERSION_FILE,
  hasPackageJson,
  readConfig,
  readPackageVersion,
  readVersionFile,
  updatePackageVersion,
  writeVersionFile,
} from '../core/config.js'
import {
  type ExpoProject,
  type ExpoTargets,
  ROOT_SERVICE,
  detectExpoProject,
  expoTargetsFromConfig,
  nextBuildNumber,
  readNativeState,
  updateNativeVersions,
} from '../core/expo.js'
import {
  commitFiles,
  createTag,
  currentBranch,
  fetchOrigin,
  hasRemote,
  isGitRepo,
  isWorkingTreeClean,
  rebaseOnto,
  refExists,
  tagExists,
} from '../core/git.js'
import { BUMPS, type Bump, allowedBumps, applyBump } from '../core/versions.js'
import { fail, must, summaryTable } from '../ui.js'

interface ServiceDecision {
  name: string
  current: string
  next: string
}

interface NativeBump {
  label: string
  project: ExpoProject
  targets: ExpoTargets
  version: string
  currentVersion: string | null
  currentBuild: number | null
  buildNumber: number
}

/** Files a native bump would touch, relative to the repo root (for the dry-run report). */
function nativeBumpFiles(root: string, bump: NativeBump): string[] {
  const files: (string | null)[] = [
    bump.targets.android ? bump.project.buildGradlePath : null,
    bump.targets.ios ? bump.project.pbxprojPath : null,
    bump.targets.ios ? bump.project.infoPlistPath : null,
    bump.targets.syncAppJson ? bump.project.appJsonPath : null,
  ]
  return files.filter((f): f is string => f !== null).map((f) => path.relative(root, f))
}

export async function releaseCommand(options: { dryRun?: boolean }): Promise<void> {
  const dryRun = options.dryRun ?? false
  const root = process.cwd()
  p.intro(pc.bgMagenta(pc.black(dryRun ? ' rpvm release (dry-run) ' : ' rpvm release ')))

  const config = readConfig(root)
  if (!config) fail(`${CONFIG_FILE} does not exist. Run ${pc.bold('rpvm init')} first.`)

  const repo = await isGitRepo(root)
  let branch: string | null = null
  let origin = false
  let onMain = false

  if (repo) {
    branch = await currentBranch(root)
    if (branch !== config.mainBranch && branch !== config.developBranch) {
      fail(
        `You are on branch ${pc.bold(branch)}. Releases can only be generated from ` +
          `${pc.bold(config.mainBranch)} (patch) or ${pc.bold(config.developBranch)}.`
      )
    }
    onMain = branch === config.mainBranch
    if (!(await isWorkingTreeClean(root))) {
      fail('The working tree is not clean. Commit or stash your changes before generating a version.')
    }
    origin = await hasRemote(root)

    if (origin && !dryRun) {
      const spinner = p.spinner()
      spinner.start('Syncing with origin (fetch + rebase)')
      try {
        await fetchOrigin(root)
        if (onMain) {
          if (await refExists(root, `origin/${config.mainBranch}`)) {
            await rebaseOnto(root, `origin/${config.mainBranch}`)
          }
        } else {
          if (await refExists(root, `origin/${config.developBranch}`)) {
            await rebaseOnto(root, `origin/${config.developBranch}`)
          }
          if (await refExists(root, `origin/${config.mainBranch}`)) {
            await rebaseOnto(root, `origin/${config.mainBranch}`)
          }
        }
        spinner.stop('Branch up to date with origin.')
      } catch (error) {
        spinner.stop('Failed to sync with origin.', 1)
        fail(error instanceof Error ? error.message : String(error))
      }
    } else if (!origin) {
      p.log.warn('The repository has no origin remote: sync is skipped.')
    }
  } else {
    p.log.warn('No git repository detected: only the version files will be updated.')
  }

  const globalCurrent = readVersionFile(root)
  if (!globalCurrent) {
    fail(`${VERSION_FILE} does not exist at the root. Run ${pc.bold('rpvm init')}.`)
  }

  if (onMain) {
    p.log.info(
      `You are on ${pc.bold(config.mainBranch)}: only ${pc.bold('patch')} releases (hotfix) are allowed.`
    )
  }

  const globalChoices: Bump[] = onMain ? ['patch'] : [...BUMPS]
  const globalBump = must(
    await p.select({
      message: `Global release type (current version: ${globalCurrent})`,
      options: globalChoices.map((bump) => ({
        value: bump as string,
        label: bump,
        hint: `${globalCurrent} → ${applyBump(globalCurrent, bump)}`,
      })),
    })
  ) as Bump
  const globalNext = applyBump(globalCurrent, globalBump)
  const tag = `v${globalNext}`

  if (repo && (await tagExists(root, tag))) {
    fail(`Tag ${tag} already exists in the repository.`)
  }

  const serviceChoices = allowedBumps(globalBump)
  const decisions: ServiceDecision[] = []
  for (const name of config.services) {
    const dir = path.join(root, name)
    const current = readVersionFile(dir) ?? readPackageVersion(dir)
    if (!current) {
      fail(`Service ${pc.bold(name)} has no ${VERSION_FILE}. Run ${pc.bold('rpvm init')} again.`)
    }
    const bump = must(
      await p.select({
        message: `Bump ${pc.cyan(name)}? (current: ${current})`,
        options: [
          { value: 'none', label: 'no bump', hint: `stays at ${current}` },
          ...serviceChoices.map((b) => ({
            value: b as string,
            label: b,
            hint: `${current} → ${applyBump(current, b)}`,
          })),
        ],
      })
    ) as Bump | 'none'
    decisions.push({ name, current, next: bump === 'none' ? current : applyBump(current, bump) })
  }

  const nativeBumps: NativeBump[] = []
  for (const [key, targets] of Object.entries(expoTargetsFromConfig(config))) {
    const isRoot = key === ROOT_SERVICE
    const decision = isRoot ? null : decisions.find((d) => d.name === key)
    // The global version always bumps; a service's native files only move with the service.
    if (!isRoot && (!decision || decision.next === decision.current)) continue
    const project = detectExpoProject(isRoot ? root : path.join(root, key))
    const state = readNativeState(project)
    const currentBuild = Math.max(state.iosBuildNumber ?? 0, state.androidVersionCode ?? 0)
    nativeBumps.push({
      label: isRoot ? 'native app' : `${key} (native)`,
      project,
      targets,
      version: isRoot ? globalNext : decision!.next,
      currentVersion: state.androidVersionName ?? state.iosVersion,
      currentBuild: currentBuild > 0 ? currentBuild : null,
      buildNumber: nextBuildNumber(state),
    })
  }

  p.note(
    summaryTable([
      { name: 'global', from: globalCurrent, to: globalNext },
      ...decisions.map((d) => ({ name: d.name, from: d.current, to: d.next })),
      ...nativeBumps.map((b) => ({
        name: b.label,
        from: `${b.currentVersion ?? '?'} (build ${b.currentBuild ?? '?'})`,
        to: `${b.version} (build ${b.buildNumber})`,
      })),
    ]),
    `Release ${tag} summary`
  )

  const confirmed = must(
    await p.confirm({
      message: dryRun ? 'Dry run: show the actions that would be executed?' : `Generate release ${tag}?`,
    })
  )
  if (!confirmed) {
    p.cancel('Release cancelled. Nothing has been modified.')
    return
  }

  const changed = decisions.filter((d) => d.next !== d.current)
  const rootHasPkg = hasPackageJson(root)
  const filesToCommit = [VERSION_FILE]
  if (rootHasPkg) filesToCommit.push('package.json')
  for (const d of changed) {
    filesToCommit.push(path.join(d.name, VERSION_FILE))
    if (hasPackageJson(path.join(root, d.name))) filesToCommit.push(path.join(d.name, 'package.json'))
  }

  if (dryRun) {
    const actions = [
      `write root ${VERSION_FILE}${rootHasPkg ? ' and package.json' : ''} → ${globalNext}`,
      ...changed.map((d) => {
        const withPkg = hasPackageJson(path.join(root, d.name)) ? ' and package.json' : ''
        return `write ${d.name}/${VERSION_FILE}${withPkg} → ${d.next}`
      }),
      ...nativeBumps.map((b) => {
        const files = nativeBumpFiles(root, b)
        if (files.length === 0) return `${b.label}: no native files found, nothing to write`
        return `write ${files.join(', ')} → ${b.version} (build ${b.buildNumber})`
      }),
    ]
    if (repo) {
      actions.push(`git commit "🔖 RPVM release ${tag}" + annotated tag ${tag}`)
      actions.push('(rpvm does not push: that is up to the developer)')
    }
    p.note(actions.join('\n'), 'Actions (not executed)')
    p.outro(pc.yellow('Dry run: nothing has been modified.'))
    return
  }

  writeVersionFile(root, globalNext)
  if (rootHasPkg) updatePackageVersion(root, globalNext)
  for (const d of changed) {
    const dir = path.join(root, d.name)
    writeVersionFile(dir, d.next)
    if (hasPackageJson(dir)) updatePackageVersion(dir, d.next)
  }
  for (const b of nativeBumps) {
    const result = updateNativeVersions(root, b.project, b.targets, b.version, b.buildNumber)
    filesToCommit.push(...result.changed)
    for (const warning of result.warnings) p.log.warn(`${b.label}: ${warning}`)
  }
  p.log.success('Version files updated.')

  if (repo) {
    try {
      await commitFiles(root, filesToCommit, `🔖 RPVM release ${tag}`)
      await createTag(root, tag, `Release ${tag}`)
      p.log.success(`Commit and tag ${tag} created.`)
    } catch (error) {
      fail(`Error creating commit/tag: ${error instanceof Error ? error.message : String(error)}`)
    }

    if (branch) {
      const pushHint = `git push ${onMain ? '' : '--force-with-lease '}origin ${branch} && git push origin ${tag}`
      p.note(
        `rpvm does not push. When you want to publish the release:\n  ${pc.cyan(pushHint)}`,
        'Next step'
      )
    }
  }

  p.outro(pc.green(`Release ${pc.bold(tag)} completed ✔`))
}
