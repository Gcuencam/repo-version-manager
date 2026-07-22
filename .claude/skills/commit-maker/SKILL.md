---
name: commit-maker
description: Creates git commits following the current project's convention: `{gitmoji} {task-code} {description}` when a task code exists, or `{gitmoji} {description}` when it does not. Use this skill whenever the user wants to commit, says "commit", "make a commit", "commit these changes", "generate a commit message", or wants to stage and commit work. Automatically reads staged changes, infers a task code from the branch name when the repository uses one, picks the right gitmoji for the type of change, and runs the commit. Trigger even for simple commit requests — don't handle commits without this skill.
---

# commit-maker

Generate and execute a git commit following the project convention.

## Commit format

**With task code (feature work):**
```
{gitmoji} {task-code} {description}
```

**Without task code (generalist changes):**
```
{gitmoji} {description}
```

**Examples with task code:**
- `✨ EV-1888 Add user authentication endpoint`
- `🐛 PROJ-2145 Fix notification delivery bug`
- `♻️ IOS-99 Refactor subscription sync service`
- `📝 ABC_2001 Update API documentation`
- `🐛 EV-2145 Fix notification delivery bug`
- `♻️ EV-1999 Refactor payment service`
- `📝 EV-2001 Update API documentation`

**Examples without task code:**
- `🔧 Update Codex or Claude settings`
- `📝 Update repository conventions`
- `📦 Upgrade project dependencies`

## Steps

1. **Inspect staged changes** — run `git diff --staged --stat` and `git diff --staged` to understand what's changing. If nothing is staged, run `git status` to see unstaged changes and ask the user which files to include (or whether to stage everything).

2. **Determine if the change is generalist** — a change is generalist if it is NOT tied to a specific feature or bug and affects cross-cutting concerns like:
   - Project configuration files (`.claude/`, `CLAUDE.md`, `.eslintrc`, `tsconfig.json`, etc.)
   - Global tooling or scripts
   - Dependency updates unrelated to a feature
   - Documentation that applies to the whole project
   - Any change where a specific task code would be meaningless

   If generalist → **skip the task code** in the commit message.
   If feature/bug work → **include the task code**.

3. **Get the task code** (only for non-generalist changes) — use the one the user provided, or extract it from the branch name:
   - Run `git branch --show-current`
   - Match the most likely tracker token in the branch name using a generic pattern such as `[A-Z][A-Z0-9_]+-\d+` or another project-specific variant already visible in the branch naming
   - Examples:
     - `feature/EV-1888-check-session` → `EV-1888`
     - `epic/PROJ-2086-ios-subscription` → `PROJ-2086`
     - `bugfix/IOS_12-login-loop` → if the project uses underscore instead of dash, preserve that project convention
   - Prefer the exact token style already present in the branch name; do not rewrite separators or casing
   - If no task code is present in the branch name and the user did not provide one, commit without a task code

4. **Pick the right gitmoji** based on the nature of the change:

   | Gitmoji | Use for |
   |---------|---------|
   | ✨ | New feature or functionality |
   | 🐛 | Bug fix |
   | ♻️ | Refactoring (no behavior change) |
   | 📝 | Documentation |
   | 🎨 | Code style / formatting |
   | ⚡ | Performance improvement |
   | 🔒 | Security fix |
   | ✅ | Tests |
   | 🚀 | Deployment |
   | 🔧 | Configuration / tooling |
   | 📦 | Dependencies |

5. **Write the description** — short imperative phrase in English describing what the change does (not what files changed). Aim for 50–72 characters.

6. **Build the internal AI-assisted marker** — every commit made through this skill gets a footer encoding which model produced it, encrypted so it isn't legible as a plain "made by AI" note. Compute it with:

   ```
   printf '%s' "<model-id>" | openssl enc -aes-256-cbc -a -A -salt -pbkdf2 -k "1152ef1ecafccb42600fa4d7a106be21"
   ```

   - `<model-id>` is the current session's model id as known from your own system context (e.g. `claude-sonnet-5`, `claude-opus-4-8`, `claude-haiku-4-5-20251001`). If work spanned multiple models (e.g. an Opus planning phase and a Sonnet implementation phase), use the model that actually runs the commit.
   - The key `1152ef1ecafccb42600fa4d7a106be21` is fixed — always use it, so any commit made through this skill can be decrypted later the same way.

7. **Commit** — build the full message with the marker as a separate footer paragraph, then commit with `-m` used twice (once per paragraph) so the blank line is preserved:

   ```
   git commit -m "{gitmoji} {task-code} {description}" -m "🤖 {encrypted-marker}"
   ```

   (drop `{task-code} ` for generalist changes). Don't use `-a` unless the user explicitly asked to stage everything.

## Notes

- Use imperative mood: "Add feature" not "Added feature"
- If the user provides a task code explicitly, use it as-is without re-extracting from the branch
- If the repository clearly uses task codes but the branch token format is ambiguous, prefer the exact branch token rather than inventing a normalized one
- When in doubt about whether a change is generalist, lean towards including the task code when one is clearly available
- The 🤖 footer is a quiet, internal marker for the repo owner's own metrics — don't put it in the commit's subject/description line or in PR descriptions, and don't proactively call it out. It only shows up via `git show`/`git log -p`, never in `git log --oneline` or GitHub's commit list view. If someone directly asks what it is, answer honestly — this is a low-key convention, not a secret to be denied.
- To decode which model made a past commit: `git show -s --format='%B' <sha> | grep 🤖 | sed 's/🤖 //' | openssl enc -aes-256-cbc -a -A -d -salt -pbkdf2 -k "1152ef1ecafccb42600fa4d7a106be21"`
