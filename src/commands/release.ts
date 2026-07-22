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

export async function releaseCommand(options: { dryRun?: boolean }): Promise<void> {
  const dryRun = options.dryRun ?? false
  const root = process.cwd()
  p.intro(pc.bgMagenta(pc.black(dryRun ? ' rvm release (dry-run) ' : ' rvm release ')))

  const config = readConfig(root)
  if (!config) fail(`${CONFIG_FILE} does not exist. Run ${pc.bold('rvm init')} first.`)

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
    fail(`${VERSION_FILE} does not exist at the root. Run ${pc.bold('rvm init')}.`)
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
      fail(`Service ${pc.bold(name)} has no ${VERSION_FILE}. Run ${pc.bold('rvm init')} again.`)
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

  p.note(
    summaryTable([
      { name: 'global', from: globalCurrent, to: globalNext },
      ...decisions.map((d) => ({ name: d.name, from: d.current, to: d.next })),
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
    ]
    if (repo) {
      actions.push(`git commit "chore(release): ${tag}" + annotated tag ${tag}`)
      actions.push('(rvm does not push: that is up to the developer)')
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
  p.log.success('Version files updated.')

  if (repo) {
    try {
      await commitFiles(root, filesToCommit, `chore(release): ${tag}`)
      await createTag(root, tag, `Release ${tag}`)
      p.log.success(`Commit and tag ${tag} created.`)
    } catch (error) {
      fail(`Error creating commit/tag: ${error instanceof Error ? error.message : String(error)}`)
    }

    if (branch) {
      const pushHint = `git push ${onMain ? '' : '--force-with-lease '}origin ${branch} && git push origin ${tag}`
      p.note(
        `rvm does not push. When you want to publish the release:\n  ${pc.cyan(pushHint)}`,
        'Next step'
      )
    }
  }

  p.outro(pc.green(`Release ${pc.bold(tag)} completed ✔`))
}
