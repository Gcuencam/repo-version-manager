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
  p.intro(pc.bgMagenta(pc.black(dryRun ? ' mvm release (dry-run) ' : ' mvm release ')))

  const config = readConfig(root)
  if (!config) fail(`No existe ${CONFIG_FILE}. Ejecuta primero ${pc.bold('mvm init')}.`)

  const repo = await isGitRepo(root)
  let branch: string | null = null
  let origin = false
  let onMain = false

  if (repo) {
    branch = await currentBranch(root)
    if (branch !== config.mainBranch && branch !== config.developBranch) {
      fail(
        `Estás en la rama ${pc.bold(branch)}. Los releases solo se generan desde ` +
          `${pc.bold(config.mainBranch)} (patch) o ${pc.bold(config.developBranch)}.`
      )
    }
    onMain = branch === config.mainBranch
    if (!(await isWorkingTreeClean(root))) {
      fail('El working tree no está limpio. Haz commit o stash de tus cambios antes de generar versión.')
    }
    origin = await hasRemote(root)

    if (origin && !dryRun) {
      const spinner = p.spinner()
      spinner.start('Sincronizando con origin (fetch + rebase)')
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
        spinner.stop('Rama actualizada con origin.')
      } catch (error) {
        spinner.stop('Error al sincronizar con origin.', 1)
        fail(error instanceof Error ? error.message : String(error))
      }
    } else if (!origin) {
      p.log.warn('El repositorio no tiene remoto origin: se omite la sincronización.')
    }
  } else {
    p.log.warn('No se ha detectado repositorio git: solo se actualizarán los archivos de versión.')
  }

  const globalCurrent = readVersionFile(root)
  if (!globalCurrent) {
    fail(`No existe ${VERSION_FILE} en la raíz. Ejecuta ${pc.bold('mvm init')}.`)
  }

  if (onMain) {
    p.log.info(
      `Estás en ${pc.bold(config.mainBranch)}: solo se permiten releases ${pc.bold('patch')} (hotfix).`
    )
  }

  const globalChoices: Bump[] = onMain ? ['patch'] : [...BUMPS]
  const globalBump = must(
    await p.select({
      message: `Tipo de release global (versión actual: ${globalCurrent})`,
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
    fail(`La tag ${tag} ya existe en el repositorio.`)
  }

  const serviceChoices = allowedBumps(globalBump)
  const decisions: ServiceDecision[] = []
  for (const name of config.services) {
    const dir = path.join(root, name)
    const current = readVersionFile(dir) ?? readPackageVersion(dir)
    if (!current) {
      fail(`El servicio ${pc.bold(name)} no tiene ${VERSION_FILE}. Ejecuta ${pc.bold('mvm init')} de nuevo.`)
    }
    const bump = must(
      await p.select({
        message: `¿Sube de versión ${pc.cyan(name)}? (actual: ${current})`,
        options: [
          { value: 'none', label: 'no sube', hint: `se queda en ${current}` },
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
    `Resumen del release ${tag}`
  )

  const confirmed = must(
    await p.confirm({
      message: dryRun ? 'Dry run: ¿mostrar las acciones que se ejecutarían?' : `¿Generar el release ${tag}?`,
    })
  )
  if (!confirmed) {
    p.cancel('Release cancelado. No se ha modificado nada.')
    return
  }

  const changed = decisions.filter((d) => d.next !== d.current)
  const filesToCommit = [VERSION_FILE]
  for (const d of changed) {
    filesToCommit.push(path.join(d.name, VERSION_FILE))
    if (hasPackageJson(path.join(root, d.name))) filesToCommit.push(path.join(d.name, 'package.json'))
  }

  if (dryRun) {
    const actions = [
      `escribir ${VERSION_FILE} raíz → ${globalNext}`,
      ...changed.map((d) => {
        const withPkg = hasPackageJson(path.join(root, d.name)) ? ' y package.json' : ''
        return `escribir ${d.name}/${VERSION_FILE}${withPkg} → ${d.next}`
      }),
    ]
    if (repo) {
      actions.push(`git commit "chore(release): ${tag}" + tag anotada ${tag}`)
      actions.push('(mvm no hace push: queda en manos del desarrollador)')
    }
    p.note(actions.join('\n'), 'Acciones (no ejecutadas)')
    p.outro(pc.yellow('Dry run: no se ha modificado nada.'))
    return
  }

  writeVersionFile(root, globalNext)
  for (const d of changed) {
    const dir = path.join(root, d.name)
    writeVersionFile(dir, d.next)
    if (hasPackageJson(dir)) updatePackageVersion(dir, d.next)
  }
  p.log.success('Archivos de versión actualizados.')

  if (repo) {
    try {
      await commitFiles(root, filesToCommit, `chore(release): ${tag}`)
      await createTag(root, tag, `Release ${tag}`)
      p.log.success(`Commit y tag ${tag} creados.`)
    } catch (error) {
      fail(`Error creando commit/tag: ${error instanceof Error ? error.message : String(error)}`)
    }

    if (branch) {
      const pushHint = `git push ${onMain ? '' : '--force-with-lease '}origin ${branch} && git push origin ${tag}`
      p.note(
        `mvm no hace push. Cuando quieras publicar el release:\n  ${pc.cyan(pushHint)}`,
        'Siguiente paso'
      )
    }
  }

  p.outro(pc.green(`Release ${pc.bold(tag)} completado ✔`))
}
