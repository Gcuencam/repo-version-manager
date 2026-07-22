#!/usr/bin/env node
import { createRequire } from 'node:module'
import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { releaseCommand } from './commands/release.js'
import { statusCommand } from './commands/status.js'

const pkg = createRequire(import.meta.url)('../package.json') as { version: string }

const program = new Command()

program
  .name('rpvm')
  .description('Repo Version Manager: manage the global version of a repo or monorepo and the version of each service')
  .version(pkg.version)

program
  .command('init')
  .description('interactively set up the monorepo (services, versions and branches)')
  .action(initCommand)

program
  .command('release')
  .description('generate a new version (global and per service) with commit and tag; pushing is up to you')
  .option('--dry-run', 'show what would be done without modifying files or touching git')
  .action(releaseCommand)

program
  .command('status')
  .description('show current versions and sync status')
  .action(statusCommand)

await program.parseAsync()
