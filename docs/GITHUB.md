# Publish the source to GitHub

Destination: https://github.com/NmnK007/SutraTrace

The project directory initially has no Git metadata. The commands below publish source code, not evidence or the local server. Publishing this repository does not deploy the application.

## Empty destination repository

Run from PowerShell:

```powershell
cd C:\SutraTrace
git init -b main
git remote add origin https://github.com/NmnK007/SutraTrace.git
git add .
git status --short
git diff --cached --stat
git commit -m "Build SutraTrace local forensic investigation workbench"
git push -u origin main
```

Before committing, ensure the staged list contains source, tests, docs, and synthetic samples only. `data/`, `references/`, `.venv/`, `node_modules/`, `.env`, and `tmp/` must not be staged. `.gitignore` already excludes them.

If Git needs an identity, set your own GitHub name and email **for this repository**:

```powershell
git config user.name "Your name"
git config user.email "Your GitHub email or GitHub noreply address"
```

Then repeat the commit and push. Sign in through Git Credential Manager's browser flow if prompted. Do not put an account password or token in the remote URL.

## If the GitHub repository already contains commits

Do not force push. After creating your local commit and adding the remote:

```powershell
git fetch origin
git remote show origin
```

Use the default branch shown there (commonly `main`). If it is `main`:

```powershell
git merge origin/main --allow-unrelated-histories
```

Resolve any overlapping README or other files in your editor, preserving desired content from both versions, then:

```powershell
git add .
git commit
git push -u origin main
```

Skip `git commit` if Git completed the merge automatically. If the branch is protected, push a feature branch instead and open a pull request:

```powershell
git switch -c feature/local-forensic-workbench
git push -u origin feature/local-forensic-workbench
```

For later changes, use `git add .`, inspect the staged files, commit with a descriptive message, and `git push`. Never use `git add -f data` or upload real case material.
