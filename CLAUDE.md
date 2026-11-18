@AGENTS.md

## Claude Code

- Use plan mode before changes that touch federation, Drizzle migrations or the payment boundary.
- Do all edits in a git worktree from `origin/main`; never delegate writes to a forked subagent that shares the checkout.
