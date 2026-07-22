import semver from 'semver'

export type Bump = 'patch' | 'minor' | 'major'

export const BUMPS: readonly Bump[] = ['patch', 'minor', 'major']

const ORDER: Record<Bump, number> = { patch: 0, minor: 1, major: 2 }

/** Bumps allowed for a service given the global bump: never above the global one. */
export function allowedBumps(globalBump: Bump): Bump[] {
  return BUMPS.filter((bump) => ORDER[bump] <= ORDER[globalBump])
}

export function applyBump(version: string, bump: Bump): string {
  const next = semver.inc(version, bump)
  if (!next) throw new Error(`Versión semver inválida: "${version}"`)
  return next
}

export function isValidVersion(version: string): boolean {
  return semver.valid(version) !== null
}
