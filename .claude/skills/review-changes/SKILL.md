---
name: review-changes
description: Run the full pre-commit loop on the current changes (checks, independent review, fixes, summary). Use before every commit or pull request.
---

# Review changes

1. `npm run typecheck` and `npm run test`. Fix failures before going on.
2. Hand the diff to the `code-reviewer` subagent. It has not seen the work,
   which is the point: the author does not grade its own change.
3. For each finding: fix it, or write one line on why it does not apply.
   Missing tests go to the `test-writer` subagent.
4. Re-run the checks.
5. Write the commit message: what changed and why, in the imperative,
   with the user-visible effect first.
