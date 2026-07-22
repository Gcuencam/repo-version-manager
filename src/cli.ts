#!/usr/bin/env node
import { createRequire } from 'node:module'
import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { releaseCommand } from './commands/release.js'
import { statusCommand } from './commands/status.js'

const pkg = createRequire(import.meta.url)('../package.json') as { version: string }

const program = new Command()

program
  .name('mvm')
  .description('Monorepo Version Manager: gestiona la versión global del monorepo y la de cada servicio')
  .version(pkg.version)

program
  .command('init')
  .description('configura el monorepo de forma interactiva (servicios, versiones y ramas)')
  .action(initCommand)

program
  .command('release')
  .description('genera una nueva versión (global y por servicio) con commit y tag; el push queda en tus manos')
  .option('--dry-run', 'muestra lo que haría sin modificar archivos ni tocar git')
  .action(releaseCommand)

program
  .command('status')
  .description('muestra las versiones actuales y el estado de sincronización')
  .action(statusCommand)

await program.parseAsync()
