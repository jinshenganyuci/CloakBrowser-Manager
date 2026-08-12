# Agent Instructions

## Quality Gates

Before completing work that changes code, run the relevant checks:

```bash
.venv/bin/python -m pytest backend/tests -q
cd frontend && npm test -- --run --maxWorkers=1
cd frontend && npm run build
bash -n entrypoint.sh
docker compose config
git diff --check
```

If a check cannot run in the current environment, report the exact blocker.

## Release Completion

When a task explicitly includes a release or push:

1. Run the quality gates.
2. Confirm the intended commit and version tag.
3. Push the commit and tag to the configured remote.
4. Build and push the requested release image.
5. Verify the remote Git refs and Docker image digest.
