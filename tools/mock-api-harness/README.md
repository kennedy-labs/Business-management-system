# mock-api-harness

Drives the **in-memory mock API** that the frontend used to serve by default, and
is the origin of the evidence in `SYSTEM_DIAGNOSIS_AND_POLISH_PLAN.md`.

```bash
node run.mjs          # prints every check with observed values
node run.mjs --json   # machine-readable results
```

Last recorded run: `last-run.txt` — **44 checks | 11 PASS | 31 FAIL | 2 NOTE**.

## What is in here

| File | Purpose |
|------|---------|
| `route.ts` | A byte-for-byte copy of `frontend/src/app/api/[...slug]/route.ts` (the handler that served the deployed app). Kept for the historical record. |
| `run.mjs` | The 10 scenarios, driven in-process. |
| `node_modules/next/server.js` | A ~30-line stand-in for `next/server` so the handler can run outside Next.js. **Committed deliberately** (the repo's `.gitignore` excludes `node_modules/`, so it was force-added) — without it the harness cannot run. |
| `last-run.txt` | The saved output of the last run. |

## Important

`route.ts` here is a **copy**, not a symlink. Once T0.4 of `FIX_PLAN.md` deletes
the real mock, this copy becomes the only remaining record of that behaviour and
should be kept as-is for reference.

For testing the **real** backend, use `tools/api-harness/` (created in T0.3), which
speaks HTTP to the running NestJS API.
