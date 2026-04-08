Run the full pre-push verification checklist from CLAUDE.md before pushing any code:

1. `npm run typecheck` — must pass with zero errors
2. `npm run lint` — must pass with zero warnings
3. `npm run build` — must produce a successful production build
4. Run `/react-review` to check for infinite re-render patterns
5. Check that no .env files or API keys are staged: `git diff --cached --name-only | grep -E '\.env|credentials|secret'`

Report pass/fail for each step. Do NOT push if any step fails — fix the issues first.
