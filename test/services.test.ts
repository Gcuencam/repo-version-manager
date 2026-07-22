import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listCandidateDirs } from '../src/core/services.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvm-test-'))
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
      { name: 'api', hasPackageJson: false, version: null },
      { name: 'web', hasPackageJson: true, version: '3.1.4' },
    ])
  })

  it('returns an empty list for a directory without folders', () => {
    expect(listCandidateDirs(dir)).toEqual([])
  })
})
