import { execa } from 'execa'

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execa('git', args, { cwd })
  return stdout.trim()
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await git(cwd, 'rev-parse', '--is-inside-work-tree')
    return true
  } catch {
    return false
  }
}

export async function currentBranch(cwd: string): Promise<string> {
  return git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
}

export async function localBranches(cwd: string): Promise<string[]> {
  const out = await git(cwd, 'for-each-ref', '--format=%(refname:short)', 'refs/heads')
  return out ? out.split('\n') : []
}

export async function isWorkingTreeClean(cwd: string): Promise<boolean> {
  return (await git(cwd, 'status', '--porcelain')) === ''
}

export async function hasRemote(cwd: string, name = 'origin'): Promise<boolean> {
  const remotes = await git(cwd, 'remote')
  return remotes.split('\n').includes(name)
}

export async function fetchOrigin(cwd: string): Promise<void> {
  await git(cwd, 'fetch', 'origin', '--tags')
}

export async function refExists(cwd: string, ref: string): Promise<boolean> {
  try {
    await git(cwd, 'rev-parse', '--verify', '--quiet', ref)
    return true
  } catch {
    return false
  }
}

export async function tagExists(cwd: string, tag: string): Promise<boolean> {
  return refExists(cwd, `refs/tags/${tag}`)
}

/** Rebase onto a ref; on conflicts, aborts the rebase and throws an error with instructions. */
export async function rebaseOnto(cwd: string, ref: string): Promise<void> {
  try {
    await git(cwd, 'rebase', ref)
  } catch {
    await execa('git', ['rebase', '--abort'], { cwd, reject: false })
    throw new Error(
      `El rebase sobre ${ref} tiene conflictos. Resuélvelos a mano (git rebase ${ref}) y vuelve a ejecutar mvm release.`
    )
  }
}

export async function commitFiles(cwd: string, files: string[], message: string): Promise<void> {
  await git(cwd, 'add', '--', ...files)
  await git(cwd, 'commit', '-m', message)
}

export async function createTag(cwd: string, tag: string, message: string): Promise<void> {
  await git(cwd, 'tag', '-a', tag, '-m', message)
}
