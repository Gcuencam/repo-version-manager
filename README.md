# Repo Version Manager (`rvm`)

Interactive CLI to manage the **global version** of a repository — and, in monorepos, the **individual version** of each service it contains — with git integration (branches, tags, rebase).

> `rvm` creates commits and tags, but it **never pushes**. Publishing the release is always up to the developer — the CLI prints the exact push command to run.

## Installation

```sh
npm install -g repo-version-manager
```

The package installs two equivalent binaries: `rvm` and `repov`. If you have [Ruby's RVM](https://rvm.io) installed, its `rvm` command will conflict with ours — use `repov` in that case.

## Usage

### `rvm init`

Interactively sets up the repository from its root:

1. Answer whether the repository is a **monorepo with services** (the default is auto-detected from your folder structure).
2. **Monorepo**: mark which first-level folders are services (folders with a `package.json` come preselected) and review/edit each service's version. **Single repo**: this step is skipped — there are no services, only the global version.
3. Review/edit the global version (defaults to the root `package.json` version when available).
4. Confirm the main branch (`main`/`master`) and the development branch (`develop`/`development`).
5. Generates `.rvmrc.json`, a hidden `.version` file at the root (and in each service in monorepo mode), updates the `package.json` files — including the root one, if present — commits those files (`🔖 RVM init vX.Y.Z`) and, optionally, creates the initial `vX.Y.Z` tag pointing at that commit.

### `rvm release`

Generates a new version:

1. Checks that the working tree is clean and that you are on the main or the development branch.
2. Syncs with `origin`: on the development branch it rebases onto `origin/<develop>` and `origin/<main>` (main hotfixes get incorporated); on main it rebases onto `origin/<main>`.
3. You pick the global bump: `patch`, `minor` or `major`. **From the main branch only `patch` is allowed** (hotfix).
4. In monorepo mode, for each service you decide whether it bumps and how much: never above the global bump (if the global bump is `minor`, a service can be `minor`, `patch` or stay unchanged). In single-repo mode there is nothing else to decide.
5. Shows a summary and, on confirmation: writes the `.version` files and the affected `package.json` files (the root one included, when present), creates the `🔖 RVM release vX.Y.Z` commit and the annotated `vX.Y.Z` tag. It then prints the suggested push command (`git push --force-with-lease` on the development branch after the rebase; never force on main) — but does not run it.

With `--dry-run` it walks through the whole flow without touching files or git.

### `rvm status`

Shows the global version (and each service's version in monorepo mode), and warns when a `package.json` is out of sync with its `.version` file (`.version` is the source of truth).

## Generated files

| File | Where | Content |
|---|---|---|
| `.rvmrc.json` | root | mode (monorepo or not), branches and service list |
| `.version` | root | global repository version |
| `.version` | each service (monorepo mode) | service version |

## Rules

- A service bump never exceeds the global one: `patch` < `minor` < `major`; a service may stay unchanged.
- From the main branch only `patch` releases are generated.
- Git tags (`vX.Y.Z`) track the global version.
- `rvm` never pushes: commits and tags stay local until you push them.
- Without a git repository, `rvm` only manages the version files.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
npm link   # to try `rvm` locally
```

## License

[MIT](LICENSE)
