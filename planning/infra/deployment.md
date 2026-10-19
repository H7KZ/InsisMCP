# Deployment: environments, CI/CD, rollback

## Environments

| Env           | Host             | Branch    | Deploys                |
|---------------|------------------|-----------|------------------------|
| `production`  | `mcp.vse.cz`     | `main`    | on push to `main` (not enabled until the DNS name exists; then with required reviewers) |
| `development` | `bpmcp.vse.cz`   | `develop` | on push to `develop`   |

Both on the same VM, real data, own MCP container, own ETL run, own database. Development exists because Oracle is
unreachable from a laptop: transforms and tools are tested against real InSIS data before release.

`mcp.vse.cz` is the official name once the server is tested. Only development is deployed until then.

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

- GitHub-hosted runners, push over SSH (SSH on the VM is public, key-only, fail2ban).
- Branch protection on `main` and `develop`; the `production` Environment requires a reviewer.
- GitHub **Environments** `production` / `development` scope the secrets and record deploy history.
- Secrets: dedicated ed25519 deploy key + **pinned host key** (`known_hosts`), never `StrictHostKeyChecking=no`.
- CI never holds database, Oracle or Discord credentials.

## `insis-deploy <env> <sha>` (source: `deploy/bin/deploy.sh`)

Installed by hand as `/usr/local/sbin/insis-deploy` (root-owned). The `deploy` user reaches it through the forced SSH
command and `sudo`; it runs as root, with no Docker group membership for `deploy`. CI cannot change the script.

1. Validate arguments (`^(dev|prod) [0-9a-f]{40}$`).
2. Check `<sha>` is on `develop` (dev) or `main` (prod) with the GitHub compare API; refuse otherwise.
3. Fetch `deploy/stacks/app/` from the public repo tarball at exactly `<sha>`
   (`codeload.github.com/H7KZ/InsisMCP/tar.gz/<sha>`) into `/srv/insis-mcp/app/` → compose file always matches the
   image commit. (The forced command rules out scp/rsync.) Treat it as untrusted: refuse a compose file with
   `privileged`, `cap_add`, `network_mode: host`, `pid: host`, `devices`, extra `security_opt`, or any bind mount.
4. Pull images.
5. If the `etl` image differs from `last-good` → run the ETL under `flock`; failure aborts, nothing switched.
6. `docker compose up -d` for the app stack.
7. Poll `/health` up to 60 s; healthy includes `meta.schema_version` == MCP's expected version.
8. Success → write `current` and `last-good`, append `deploys.log`, Discord `#deploys`.
9. Failure → **automatic rollback** to `last-good`, exit 1 → job red, Discord `#deploys`.

Automatic rollback applies to both environments. Manual rollback = `workflow_dispatch` with an older SHA.

State lives in `/var/lib/insis-mcp/<env>/` (`current`, `last-good`, `deploys.log`: SHA, image tags, timestamp).

## What CI does not touch

Bootstrapped and changed **manually**, rarely:

- the deploy script itself and the `deploy` user, SSH keys, sudoers, sshd, firewall;
- `platform` and `monitoring` stacks (including Traefik and its certificates);
- systemd units;
- `/etc/insis-mcp/*.env`.

## Bootstrap runbook

`deploy/BOOTSTRAP.md`: copy-paste commands to review and run by hand, not an automated script:

- create `deploy` user, directories and permissions (`/etc`, `/srv`, `/var/lib`);
- generate deploy key, `authorized_keys` with forced command, sshd hardening;
- Docker install, `daemon.json` (log rotation), journald limit, `unattended-upgrades`;
- `ufw` and `DOCKER-USER` firewall rules (only 22, 80, 443 from outside), fail2ban;
- verification from outside (redirect, certificate, headers, rate limit, open ports) and a "key leaked" procedure;
- env files from `deploy/env/*.env.example`;
- start `platform` and `monitoring`; Postgres databases and roles;
- install and enable systemd units;
- add GitHub Environment secrets.
