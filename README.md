# Repo Version Manager (`rpvm`)

[![CI](https://img.shields.io/github/actions/workflow/status/Gcuencam/repo-version-manager/ci.yml?branch=main&label=tests)](https://github.com/Gcuencam/repo-version-manager/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/repo-version-manager)](https://www.npmjs.com/package/repo-version-manager)
[![npm downloads](https://img.shields.io/npm/dm/repo-version-manager)](https://www.npmjs.com/package/repo-version-manager)
[![install size](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fpackagephobia.com%2Fv2%2Fapi.json%3Fp%3Drepo-version-manager&query=%24.install.pretty&label=install%20size)](https://packagephobia.com/result?p=repo-version-manager)
[![license](https://img.shields.io/github/license/Gcuencam/repo-version-manager)](./LICENSE)

Interactive CLI to manage the **global version** of a repository — and, in monorepos, the **individual version** of each service it contains — with git integration (branches, tags, rebase).

> `rpvm` creates commits and tags, but it **never pushes**. Publishing the release is always up to the developer — the CLI prints the exact push command to run.

## Installation

```sh
npm install -g repo-version-manager
```

The package installs a single binary: `rpvm`.

## Usage

### `rpvm init`

Interactively sets up the repository from its root:

1. Answer whether the repository is a **monorepo with services** (the default is auto-detected from your folder structure).
2. **Monorepo**: mark which first-level folders are services (folders with a `package.json` come preselected) and review/edit each service's version. **Single repo**: this step is skipped — there are no services, only the global version.
3. Review/edit the global version (defaults to the root `package.json` version when available).
4. Confirm the main branch (`main`/`master`) and the development branch (`develop`/`development`).
5. Generates `.rpvmrc.json`, a hidden `.version` file at the root (and in each service in monorepo mode), updates the `package.json` files — including the root one, if present — commits those files (`🔖 RPVM init vX.Y.Z`) and, optionally, creates the initial `vX.Y.Z` tag pointing at that commit.

### `rpvm release`

Generates a new version:

1. Checks that the working tree is clean and that you are on the main or the development branch.
2. Syncs with `origin`: on the development branch it rebases onto `origin/<develop>` and `origin/<main>` (main hotfixes get incorporated); on main it rebases onto `origin/<main>`.
3. You pick the global bump: `patch`, `minor` or `major`. **From the main branch only `patch` is allowed** (hotfix).
4. In monorepo mode, for each service you decide whether it bumps and how much: never above the global bump (if the global bump is `minor`, a service can be `minor`, `patch` or stay unchanged). In single-repo mode there is nothing else to decide.
5. Shows a summary and, on confirmation: writes the `.version` files and the affected `package.json` files (the root one included, when present), creates the `🔖 RPVM release vX.Y.Z` commit and the annotated `vX.Y.Z` tag. It then prints the suggested push command (`git push --force-with-lease` on the development branch after the rebase; never force on main) — but does not run it.

With `--dry-run` it walks through the whole flow without touching files or git.

### `rpvm status`

Shows the global version (and each service's version in monorepo mode), and warns when a `package.json` is out of sync with its `.version` file (`.version` is the source of truth).

## Generated files

| File | Where | Content |
|---|---|---|
| `.rpvmrc.json` | root | mode (monorepo or not), branches and service list |
| `.version` | root | global repository version |
| `.version` | each service (monorepo mode) | service version |

## Rules

- A service bump never exceeds the global one: `patch` < `minor` < `major`; a service may stay unchanged.
- From the main branch only `patch` releases are generated.
- Git tags (`vX.Y.Z`) track the global version.
- `rpvm` never pushes: commits and tags stay local until you push them.
- Without a git repository, `rpvm` only manages the version files.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
npm link   # to try `rpvm` locally
```

## License

[MIT](LICENSE)
