import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listCandidateDirs } from '../src/core/services.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpvm-test-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('listCandidateDirs', () => {
  it('lists first-level directories excluding hidden ones and node_modules', () => {
    fs.mkdirSync(path.join(dir, 'api'))
    fs.mkdirSync(path.join(dir, 'web'))
    fs.mkdirSync(path.join(dir, '.git'))
    fs.mkdirSync(path.join(dir, 'node_modules'))
    fs.writeFileSync(path.join(dir, 'README.md'), 'not a directory')
    fs.writeFileSync(path.join(dir, 'web', 'package.json'), JSON.stringify({ version: '3.1.4' }))

    const candidates = listCandidateDirs(dir)
    expect(candidates).toEqual([
      { name: 'api', hasPackageJson: false, version: null, hasSubdirs: false },
      { name: 'web', hasPackageJson: true, version: '3.1.4', hasSubdirs: false },
    ])
  })

  it('returns an empty list for a directory without folders', () => {
    expect(listCandidateDirs(dir)).toEqual([])
  })

  it('reports hasSubdirs and can scan a subfolder as candidates', () => {
    fs.mkdirSync(path.join(dir, 'api', 'core'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'web'))
    fs.writeFileSync(
      path.join(dir, 'api', 'core', 'package.json'),
      JSON.stringify({ version: '2.0.1' })
    )

    const candidates = listCandidateDirs(dir)
    expect(candidates).toEqual([
      { name: 'api', hasPackageJson: false, version: null, hasSubdirs: true },
      { name: 'web', hasPackageJson: false, version: null, hasSubdirs: false },
    ])

    expect(listCandidateDirs(path.join(dir, 'api'))).toEqual([
      { name: 'core', hasPackageJson: true, version: '2.0.1', hasSubdirs: false },
    ])
  })

  it('ignores hidden and node_modules subfolders when computing hasSubdirs', () => {
    fs.mkdirSync(path.join(dir, 'api', 'node_modules'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'api', '.cache'), { recursive: true })

    expect(listCandidateDirs(dir)).toEqual([
      { name: 'api', hasPackageJson: false, version: null, hasSubdirs: false },
    ])
  })
})
