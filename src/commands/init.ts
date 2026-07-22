import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import {
  CONFIG_FILE,
  type RvmConfig,
  hasPackageJson,
  readConfig,
  readPackageVersion,
  readVersionFile,
  updatePackageVersion,
  writeConfig,
  writeVersionFile,
} from '../core/config.js'
import { createTag, isGitRepo, localBranches, tagExists } from '../core/git.js'
import { listCandidateDirs } from '../core/services.js'
import { isValidVersion } from '../core/versions.js'
import { fail, must, semverHint, summaryTable } from '../ui.js'

const validateSemver = (value: string): string | undefined =>
  isValidVersion(value.trim()) ? undefined : semverHint

const validateNotEmpty = (value: string): string | undefined =>
  value.trim() ? undefined : 'Cannot be empty'

async function pickBranch(
  message: string,
  branches: string[],
  guesses: string[],
  exclude?: string
): Promise<string> {
  const candidates = branches.filter((branch) => branch !== exclude)
  if (candidates.length === 0) {
    return must(
      await p.text({ message, initialValue: guesses[0], validate: validateNotEmpty })
    ).trim()
  }

  const OTHER = '__other__'
  const guess = guesses.find((g) => candidates.includes(g))
  const choice = must(
    await p.select({
      message,
      initialValue: guess,
      options: [
        ...candidates.map((branch) => ({ value: branch, label: branch })),
        { value: OTHER, label: 'Other…', hint: 'type a branch name' },
      ],
    })
  )
  if (choice !== OTHER) return choice
  return must(await p.text({ message: 'Branch name', validate: validateNotEmpty })).trim()
}

export async function initCommand(): Promise<void> {
  const root = process.cwd()
  p.intro(pc.bgCyan(pc.black(' rvm init ')))

  if (readConfig(root)) {
    const overwrite = must(
      await p.confirm({
        message: `${CONFIG_FILE} already exists in this directory. Overwrite the configuration?`,
        initialValue: false,
      })
    )
    if (!overwrite) {
      p.cancel('Existing configuration kept.')
      return
    }
  }

  const candidates = listCandidateDirs(root)
  const looksMonorepo = candidates.some((c) => c.hasPackageJson)
  const monorepo = must(
    await p.confirm({
      message: 'Is this repository a monorepo with services?',
      initialValue: looksMonorepo,
    })
  )

  let services: string[] = []
  if (monorepo) {
    if (candidates.length === 0) {
      fail('There are no first-level folders in this directory: no services to configure.')
    }
    services = must(
      await p.multiselect({
        message: 'Which folders are services of the monorepo? (space to select, enter to confirm)',
        options: candidates.map((c) => ({
          value: c.name,
          label: c.name,
          hint: c.hasPackageJson
            ? `package.json · ${c.version ? `v${c.version}` : 'no version'}`
            : 'no package.json',
        })),
        initialValues: candidates.filter((c) => c.hasPackageJson).map((c) => c.name),
        required: true,
      })
    )
  }

  const serviceVersions = new Map<string, string>()
  for (const name of services) {
    const dir = path.join(root, name)
    const current = readVersionFile(dir) ?? readPackageVersion(dir)
    const version = must(
      await p.text({
        message: `Version of ${pc.cyan(name)}`,
        initialValue: current ?? '0.1.0',
        validate: validateSemver,
      })
    )
    serviceVersions.set(name, version.trim())
  }

  const globalVersion = must(
    await p.text({
      message: 'Global version of the repository',
      initialValue: readVersionFile(root) ?? readPackageVersion(root) ?? '0.1.0',
      validate: validateSemver,
    })
  ).trim()

  let mainBranch = 'main'
  let developBranch = 'develop'
  const repo = await isGitRepo(root)
  if (repo) {
    const branches = await localBranches(root)
    mainBranch = await pickBranch('Main branch', branches, ['main', 'master'])
    developBranch = await pickBranch(
      'Development branch',
      branches,
      ['develop', 'development'],
      mainBranch
    )
  } else {
    p.log.warn(
      'No git repository detected: default branches (main/develop) are saved and tags are skipped.'
    )
  }

  const config: RvmConfig = {
    monorepo,
    mainBranch,
    developBranch,
    services: [...services].sort((a, b) => a.localeCompare(b)),
  }
  writeConfig(root, config)
  writeVersionFile(root, globalVersion)
  if (hasPackageJson(root)) updatePackageVersion(root, globalVersion)
  for (const [name, version] of serviceVersions) {
    const dir = path.join(root, name)
    writeVersionFile(dir, version)
    if (hasPackageJson(dir)) updatePackageVersion(dir, version)
  }

  p.note(
    summaryTable([
      { name: 'global', from: globalVersion, to: globalVersion },
      ...[...serviceVersions].map(([name, version]) => ({ name, from: version, to: version })),
    ]).replaceAll('(unchanged)', ''),
    'Configured versions'
  )

  if (repo) {
    const tag = `v${globalVersion}`
    if (!(await tagExists(root, tag))) {
      const wantTag = must(
        await p.confirm({ message: `Create the initial tag ${tag}?`, initialValue: true })
      )
      if (wantTag) {
        try {
          await createTag(root, tag, `Initial version ${tag}`)
          p.log.success(`Tag ${tag} created.`)
        } catch (error) {
          p.log.warn(
            `Could not create tag ${tag}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
    }
  }

  p.log.success(`Configuration saved to ${CONFIG_FILE}`)
  p.outro(`${pc.green('Done.')} Generate your first version with ${pc.bold(pc.cyan('rvm release'))}`)
}
