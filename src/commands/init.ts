import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import {
  CONFIG_FILE,
  type MvmConfig,
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
  value.trim() ? undefined : 'No puede estar vacío'

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
        { value: OTHER, label: 'Otra…', hint: 'escribir el nombre de la rama' },
      ],
    })
  )
  if (choice !== OTHER) return choice
  return must(await p.text({ message: 'Nombre de la rama', validate: validateNotEmpty })).trim()
}

export async function initCommand(): Promise<void> {
  const root = process.cwd()
  p.intro(pc.bgCyan(pc.black(' mvm init ')))

  if (readConfig(root)) {
    const overwrite = must(
      await p.confirm({
        message: `Ya existe ${CONFIG_FILE} en este directorio. ¿Sobrescribir la configuración?`,
        initialValue: false,
      })
    )
    if (!overwrite) {
      p.cancel('Se conserva la configuración existente.')
      return
    }
  }

  const candidates = listCandidateDirs(root)
  if (candidates.length === 0) {
    fail('No hay carpetas de primer nivel en este directorio: no hay servicios que configurar.')
  }

  const services = must(
    await p.multiselect({
      message: '¿Qué carpetas son servicios del monorepo? (espacio para marcar, enter para confirmar)',
      options: candidates.map((c) => ({
        value: c.name,
        label: c.name,
        hint: c.hasPackageJson
          ? `package.json · ${c.version ? `v${c.version}` : 'sin versión'}`
          : 'sin package.json',
      })),
      initialValues: candidates.filter((c) => c.hasPackageJson).map((c) => c.name),
      required: true,
    })
  )

  const serviceVersions = new Map<string, string>()
  for (const name of services) {
    const dir = path.join(root, name)
    const current = readVersionFile(dir) ?? readPackageVersion(dir)
    const version = must(
      await p.text({
        message: `Versión de ${pc.cyan(name)}`,
        initialValue: current ?? '0.1.0',
        validate: validateSemver,
      })
    )
    serviceVersions.set(name, version.trim())
  }

  const globalVersion = must(
    await p.text({
      message: 'Versión global del monorepo',
      initialValue: readVersionFile(root) ?? '0.1.0',
      validate: validateSemver,
    })
  ).trim()

  let mainBranch = 'main'
  let developBranch = 'develop'
  const repo = await isGitRepo(root)
  if (repo) {
    const branches = await localBranches(root)
    mainBranch = await pickBranch('Rama principal', branches, ['main', 'master'])
    developBranch = await pickBranch(
      'Rama de desarrollo',
      branches,
      ['develop', 'development'],
      mainBranch
    )
  } else {
    p.log.warn(
      'No se ha detectado repositorio git: se guardan las ramas por defecto (main/develop) y se omiten las tags.'
    )
  }

  const config: MvmConfig = {
    mainBranch,
    developBranch,
    services: [...services].sort((a, b) => a.localeCompare(b)),
  }
  writeConfig(root, config)
  writeVersionFile(root, globalVersion)
  for (const [name, version] of serviceVersions) {
    const dir = path.join(root, name)
    writeVersionFile(dir, version)
    if (hasPackageJson(dir)) updatePackageVersion(dir, version)
  }

  p.note(
    summaryTable([
      { name: 'global', from: globalVersion, to: globalVersion },
      ...[...serviceVersions].map(([name, version]) => ({ name, from: version, to: version })),
    ]).replaceAll('(no sube)', ''),
    'Versiones configuradas'
  )

  if (repo) {
    const tag = `v${globalVersion}`
    if (!(await tagExists(root, tag))) {
      const wantTag = must(
        await p.confirm({ message: `¿Crear la tag inicial ${tag}?`, initialValue: true })
      )
      if (wantTag) {
        try {
          await createTag(root, tag, `Versión inicial ${tag}`)
          p.log.success(`Tag ${tag} creada.`)
        } catch (error) {
          p.log.warn(
            `No se pudo crear la tag ${tag}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
    }
  }

  p.log.success(`Configuración guardada en ${CONFIG_FILE}`)
  p.outro(`${pc.green('Listo.')} Genera tu primera versión con ${pc.bold(pc.cyan('mvm release'))}`)
}
