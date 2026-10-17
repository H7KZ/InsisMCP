# Deployment: environments, CI/CD, rollback

## Environments

| Env           | Host             | Branch    | Deploys                |
|---------------|------------------|-----------|------------------------|
| `production`  | `mcp.insis.cz`   | `main`    | on push to `main`      |
| `development` | `bpmcp.insis.cz` | `develop` | on push to `develop`   |

Both on the same VM, real data, own MCP container, own ETL run, own database. Development exists because Oracle is
unreachable from a laptop: transforms and tools are tested against real InSIS data before release.

`mcp.insis.cz` is the official name once the server is tested.

## Image identity: subtree hash

Images are keyed by the content of what they are built from, not by commit:

- `mcp` key = hash of `mcp/` + `packages/` + root `package.json` / `package-lock.json`.
- `etl` key = hash of `etl/` + `packages/` + root `package.json` / `package-lock.json`.
- Each build pushes tags `tree-<hash>` and `sha-<commit>`.

On every push: compute the key → if `tree-<hash>` exists in GHCR, **retag** (`docker buildx imagetools create`,
seconds); otherwise build.

Why: a `--no-ff` merge to `main` has a different commit SHA than `develop` but the same tree, so the image built for
`develop` is promoted to production without a rebuild. Thesis- or docs-only commits never rebuild images.

## Workflows

| File               | Trigger                                                   | Does                                                                 |
|--------------------|-----------------------------------------------------------|----------------------------------------------------------------------|
| `ci.yml`           | PR, push                                                  | lint, type-check, test, build (`mcp`, `etl`); Docker build without push on PRs |
| `deploy.yml`       | push `develop` → dev, push `main` → prod; `workflow_dispatch(env, sha)` | resolve or build images → `ssh deploy@vm "<env> <sha>"` |
| `thesis.yml`       | existing                                                  | unchanged                                                            |
| `ghcr-cleanup.yml` | weekly                                                    | prune old `sha-*` and untagged images; keep last N and anything in use or `last-good` |

- GitHub-hosted runners, push over SSH (SSH on the VM is public, key-only).
- GitHub **Environments** `production` / `development` scope the secrets and record deploy history.
- Secrets: dedicated ed25519 deploy key + **pinned host key** (`known_hosts`), never `StrictHostKeyChecking=no`.
- CI never holds database, Oracle or Discord credentials.

## `deploy.sh <env> <sha>`

Runs as `deploy` via the forced SSH command.

1. Validate arguments.
2. Fetch `deploy/` from the public repo tarball at exactly `<sha>`
   (`codeload.github.com/H7KZ/InsisMCP/tar.gz/<sha>`) into `/srv/insis-mcp/` → compose files, configs and scripts always
   match the image commit. (The forced command rules out scp/rsync.)
3. Pull images.
4. If the `etl` image differs from `last-good` → run the ETL under `flock`; failure aborts, nothing switched.
5. `docker compose up -d` for the app stack.
6. Poll `/health` up to 60 s; healthy includes `meta.schema_version` == MCP's expected version.
7. Success → write `current` and `last-good`, append `deploys.log`, Discord `#deploys`.
8. Failure → **automatic rollback** to `last-good`, exit 1 → job red, Discord `#deploys`.

Automatic rollback applies to both environments. Manual rollback = `workflow_dispatch` with an older SHA.

State lives in `/var/lib/insis-mcp/<env>/` (`current`, `last-good`, `deploys.log`: SHA, image tags, timestamp).

## What CI does not touch

Bootstrapped and changed **manually**, rarely:

- `deploy.sh` itself and the `deploy` user, SSH keys, sshd, firewall;
- `platform` and `monitoring` stacks;
- systemd units;
- `/etc/insis-mcp/*.env`.

## Bootstrap runbook

`deploy/BOOTSTRAP.md`: copy-paste commands to review and run by hand, not an automated script:

- create `deploy` user, directories and permissions (`/etc`, `/srv`, `/var/lib`);
- generate deploy key, `authorized_keys` with forced command, sshd hardening;
- Docker install, `daemon.json` (log rotation), journald limit, `unattended-upgrades`;
- `DOCKER-USER` firewall rule for `8080`;
- env files from `deploy/env/*.env.example`;
- start `platform` and `monitoring`; Postgres databases and roles;
- install and enable systemd units;
- add GitHub Environment secrets.
