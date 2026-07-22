import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  readConfig,
  readPackageVersion,
  readVersionFile,
  updatePackageVersion,
  writeConfig,
  writeVersionFile,
} from '../src/core/config.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rvm-test-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('config', () => {
  it('returns null when the config file does not exist', () => {
    expect(readConfig(dir)).toBeNull()
  })

  it('writes and reads a monorepo config back to .rvmrc.json', () => {
    const config = {
      monorepo: true,
      mainBranch: 'main',
      developBranch: 'develop',
      services: ['api', 'web'],
    }
    writeConfig(dir, config)
    expect(fs.existsSync(path.join(dir, '.rvmrc.json'))).toBe(true)
    expect(readConfig(dir)).toEqual(config)
  })

  it('writes and reads a single-repo config without services', () => {
    const config = {
      monorepo: false,
      mainBranch: 'master',
      developBranch: 'development',
      services: [],
    }
    writeConfig(dir, config)
    expect(readConfig(dir)).toEqual(config)
  })
})

describe('.version', () => {
  it('returns null when missing or empty', () => {
    expect(readVersionFile(dir)).toBeNull()
    fs.writeFileSync(path.join(dir, '.version'), '   \n')
    expect(readVersionFile(dir)).toBeNull()
  })

  it('writes with a trailing newline and reads back trimmed', () => {
    writeVersionFile(dir, '1.2.3')
    expect(fs.readFileSync(path.join(dir, '.version'), 'utf8')).toBe('1.2.3\n')
    expect(readVersionFile(dir)).toBe('1.2.3')
  })
})

describe('package.json', () => {
  it('reads the version and tolerates invalid JSON', () => {
    expect(readPackageVersion(dir)).toBeNull()
    fs.writeFileSync(path.join(dir, 'package.json'), '{ not json')
    expect(readPackageVersion(dir)).toBeNull()
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '2.0.0' }))
    expect(readPackageVersion(dir)).toBe('2.0.0')
  })

  it('updates the version preserving 4-space indentation and the trailing newline', () => {
    const raw = '{\n    "name": "api",\n    "version": "1.0.0"\n}\n'
    fs.writeFileSync(path.join(dir, 'package.json'), raw)
    updatePackageVersion(dir, '1.1.0')
    const updated = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
    expect(updated).toBe('{\n    "name": "api",\n    "version": "1.1.0"\n}\n')
  })

  it('preserves tab indentation and the absence of a trailing newline', () => {
    const raw = '{\n\t"name": "api",\n\t"version": "1.0.0"\n}'
    fs.writeFileSync(path.join(dir, 'package.json'), raw)
    updatePackageVersion(dir, '2.0.0')
    const updated = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
    expect(updated).toBe('{\n\t"name": "api",\n\t"version": "2.0.0"\n}')
  })
})
