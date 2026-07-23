import { describe, expect, it } from 'vitest'
import {
  type ExploreOption,
  collapseAt,
  expandAt,
} from '../src/prompts/explore-multiselect.js'

const folder = (value: string, extra: Partial<ExploreOption> = {}): ExploreOption => ({
  value,
  label: value,
  depth: 0,
  expandable: true,
  expanded: false,
  ...extra,
})

const child = (parent: string, name: string): ExploreOption => ({
  value: `${parent}/${name}`,
  label: `${parent}/${name}`,
  depth: 1,
  parent,
  expandable: false,
  expanded: false,
})

describe('expandAt', () => {
  it('inserts children right after the parent and marks it expanded', () => {
    const options = [folder('api'), folder('web')]
    const result = expandAt(options, 0, [child('api', 'core'), child('api', 'lib')])
    expect(result.map((o) => o.value)).toEqual(['api', 'api/core', 'api/lib', 'web'])
    expect(result[0]?.expanded).toBe(true)
    expect(result[3]).toEqual(folder('web'))
  })

  it('does not mutate the input array', () => {
    const options = [folder('api')]
    expandAt(options, 0, [child('api', 'core')])
    expect(options[0]?.expanded).toBe(false)
    expect(options).toHaveLength(1)
  })

  it('is a no-op for already expanded rows, depth-1 rows, empty children and bad indexes', () => {
    const expanded = [folder('api', { expanded: true }), child('api', 'core')]
    expect(expandAt(expanded, 0, [child('api', 'lib')])).toBe(expanded)
    expect(expandAt(expanded, 1, [child('api', 'lib')])).toBe(expanded)
    expect(expandAt(expanded, 5, [child('api', 'lib')])).toBe(expanded)
    const options = [folder('api')]
    expect(expandAt(options, 0, [])).toBe(options)
  })
})

describe('collapseAt', () => {
  it('removes only the children of the targeted parent and returns their values', () => {
    let options = [folder('api'), folder('infra'), folder('web')]
    options = expandAt(options, 0, [child('api', 'core'), child('api', 'lib')])
    options = expandAt(options, 3, [child('infra', 'terraform')])

    const { options: collapsed, removedValues } = collapseAt(options, 0)
    expect(removedValues).toEqual(['api/core', 'api/lib'])
    expect(collapsed.map((o) => o.value)).toEqual(['api', 'infra', 'infra/terraform', 'web'])
    expect(collapsed[0]?.expanded).toBe(false)
    expect(collapsed[1]?.expanded).toBe(true)
  })

  it('is a no-op for non-expanded rows and bad indexes', () => {
    const options = [folder('api'), child('other', 'x')]
    expect(collapseAt(options, 0)).toEqual({ options, removedValues: [] })
    expect(collapseAt(options, 1)).toEqual({ options, removedValues: [] })
    expect(collapseAt(options, 9)).toEqual({ options, removedValues: [] })
  })

  it('round-trips with expandAt', () => {
    const original = [folder('api'), folder('web')]
    const expanded = expandAt(original, 0, [child('api', 'core')])
    const { options: collapsed } = collapseAt(expanded, 0)
    expect(collapsed).toEqual(original)
  })
})
