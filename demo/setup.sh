#!/usr/bin/env bash
# Builds the throwaway monorepo used by demo.tape at /tmp/rpvm-demo.
# Regenerate the GIF from the repo root with:
#   bash demo/setup.sh && vhs demo/demo.tape
set -euo pipefail

DEMO=/tmp/rpvm-demo
ORIGIN=/tmp/rpvm-demo-origin.git

rm -rf "$DEMO" "$ORIGIN"
mkdir -p "$DEMO/api" "$DEMO/web"
cd "$DEMO"

cat > .rpvmrc.json <<'EOF'
{
  "monorepo": true,
  "mainBranch": "main",
  "developBranch": "develop",
  "services": ["api", "web"]
}
EOF

printf '1.2.3\n' > .version
printf '0.9.1\n' > api/.version
printf '2.1.0\n' > web/.version

cat > package.json <<'EOF'
{
  "name": "acme",
  "version": "1.2.3",
  "private": true
}
EOF

cat > api/package.json <<'EOF'
{
  "name": "@acme/api",
  "version": "0.9.1"
}
EOF

cat > web/package.json <<'EOF'
{
  "name": "@acme/web",
  "version": "2.1.0"
}
EOF

git init -q -b main
git config user.name "Demo"
git config user.email "demo@example.com"
git add -A
git commit -qm "Initial commit"
git branch develop

git init -q --bare "$ORIGIN"
git remote add origin "$ORIGIN"
git push -q origin main develop
git checkout -q develop
