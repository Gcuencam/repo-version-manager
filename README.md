# Monorepo Version Manager (`mvm`)

Interactive CLI to manage the **global version** of a monorepo and the **individual version** of each service it contains, with git integration (branches, tags, rebase).

> `mvm` creates commits and tags, but it **never pushes**. Publishing the release is always up to the developer — the CLI prints the exact push command to run.

## Installation

```sh
npm install -g monorepo-version-manager
```

## Usage

### `mvm init`

Interactively sets up the monorepo from its root:

1. Mark which first-level folders are services (folders with a `package.json` come preselected).
2. Review/edit the current version of each service and the global version.
3. Confirm the main branch (`main`/`master`) and the development branch (`develop`/`development`).
4. Generates `.mvmrc.json`, a hidden `.version` file at the root and in each service, updates the `package.json` files and, optionally, creates the initial `vX.Y.Z` tag.

### `mvm release`

Generates a new version:

1. Checks that the working tree is clean and that you are on the main or the development branch.
2. Syncs with `origin`: on the development branch it rebases onto `origin/<develop>` and `origin/<main>` (main hotfixes get incorporated); on main it rebases onto `origin/<main>`.
3. You pick the global bump: `patch`, `minor` or `major`. **From the main branch only `patch` is allowed** (hotfix).
4. For each service you decide whether it bumps and how much: never above the global bump (if the global bump is `minor`, a service can be `minor`, `patch` or stay unchanged).
5. Shows a summary and, on confirmation: writes `.version` and `package.json`, creates the `chore(release): vX.Y.Z` commit and the annotated `vX.Y.Z` tag. It then prints the suggested push command (`git push --force-with-lease` on the development branch after the rebase; never force on main) — but does not run it.

With `--dry-run` it walks through the whole flow without touching files or git.

### `mvm status`

Shows the global version, each service's version, and warns when a `package.json` is out of sync with its `.version` file (`.version` is the source of truth).

## Generated files

| File | Where | Content |
|---|---|---|
| `.mvmrc.json` | root | branches and service list |
| `.version` | root | global monorepo version |
| `.version` | each service | service version |

## Rules

- A service bump never exceeds the global one: `patch` < `minor` < `major`; a service may stay unchanged.
- From the main branch only `patch` releases are generated.
- Git tags (`vX.Y.Z`) track the global version.
- `mvm` never pushes: commits and tags stay local until you push them.
- Without a git repository, `mvm` only manages the version files.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
npm link   # to try `mvm` locally
```
