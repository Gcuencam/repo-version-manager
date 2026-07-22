import { describe, expect, it } from 'vitest'
import { allowedBumps, applyBump, isValidVersion } from '../src/core/versions.js'

describe('allowedBumps', () => {
  it('allows only patch when the global bump is patch', () => {
    expect(allowedBumps('patch')).toEqual(['patch'])
  })

  it('allows patch and minor when the global bump is minor', () => {
    expect(allowedBumps('minor')).toEqual(['patch', 'minor'])
  })

  it('allows every bump when the global bump is major', () => {
    expect(allowedBumps('major')).toEqual(['patch', 'minor', 'major'])
  })
})

describe('applyBump', () => {
  it('applies patch, minor and major', () => {
    expect(applyBump('1.2.3', 'patch')).toBe('1.2.4')
    expect(applyBump('1.2.3', 'minor')).toBe('1.3.0')
    expect(applyBump('1.2.3', 'major')).toBe('2.0.0')
  })

  it('throws on an invalid version', () => {
    expect(() => applyBump('no-semver', 'patch')).toThrow()
  })
})

describe('isValidVersion', () => {
  it('accepts valid semver', () => {
    expect(isValidVersion('0.1.0')).toBe(true)
    expect(isValidVersion('10.20.30')).toBe(true)
  })

  it('rejects invalid values', () => {
    expect(isValidVersion('1.2')).toBe(false)
    expect(isValidVersion('v1.2.3.4')).toBe(false)
    expect(isValidVersion('')).toBe(false)
  })
})
