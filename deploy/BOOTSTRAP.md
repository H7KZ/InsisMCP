# Bootstrap and hardening runbook

One-time setup of the VM, done by hand over SSH. Every step is a command to read, understand and run yourself. CI never
does any of this.

Host name below: `bpmcp.vse.cz` (dev). Production (`mcp.vse.cz`) reuses everything after its DNS record exists.

> Not everything is built yet. Steps marked **[later]** need the deploy script and database scripts from
> [README.md § TODO](README.md#todo). All commands run on the VM as your admin user with `sudo`.

## 1. What we protect and from whom

GitHub runners hold the deploy key. Assume it can leak (stolen secret, malicious workflow, bad dependency). Goal: the
leak lets an attacker deploy only a commit that is already in the repo, and nothing else.

| Attacker has                    | Can do                                                  | Cannot do                                                         |
|---------------------------------|---------------------------------------------------------|-------------------------------------------------------------------|
| Deploy SSH key                  | Run the deploy script with `<env> <sha>`                | Get a shell, copy files, forward ports, read secrets, run Docker  |
| Deploy key + push access        | Deploy any commit that is on `develop` or `main`        | Deploy a commit that is on no protected branch                    |
| Remote code in the MCP container | Read the database through the read-only role, call out  | Write the database, reach Docker, touch other containers' secrets |
| Someone on the internet         | Reach ports 22, 80, 443; rate-limited 60 req/s per IP   | Reach Postgres, Grafana, metrics, Docker                          |

Rules that make this true:

1. **No Docker rights for CI.** Anyone who can use Docker is root. The `deploy` user is not in the `docker` group. It can
   only run one root-owned script through `sudo`.
2. **The gate is on the VM.** The deploy script is installed by you, from a commit you reviewed. CI cannot change it.
3. **CI only chooses a commit.** The script accepts `dev|prod` and a 40-character SHA, checks that the SHA is on the
   matching protected branch, downloads that commit's `deploy/stacks/app/` and refuses unsafe compose settings.
4. **Secrets live only on the VM**, in `/etc/insis-mcp/` (`root:root 600`). CI holds no database, Oracle or Discord secret.
5. **Containers have the least they need**: no extra capabilities, read-only filesystem, no new privileges, memory and
   process limits. Only Traefik reads Docker info, through a read-only proxy.

## 2. Free ports 80 and 443

Traefik needs both. Check that nothing else holds them:

```bash
sudo ss -tlnp | grep -E ':(80|443)\b'      # must print nothing
docker ps --format '{{.Names}}\t{{.Ports}}'
```

If an old container is listed, stop it: `docker rm -f <name>`. If it is not yours, ask first.

## 3. Packages and automatic updates

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades fail2ban iptables-persistent
sudo dpkg-reconfigure -plow unattended-upgrades     # answer Yes
```

`fail2ban` bans addresses that fail SSH logins. Ubuntu enables its `sshd` jail by default. Make it stricter:

```bash
sudo tee /etc/fail2ban/jail.d/insis.local >/dev/null <<'EOF'
[sshd]
enabled = true
maxretry = 3
bantime = 1h
EOF
sudo systemctl restart fail2ban
```

## 4. SSH

Keep a second SSH session open while doing this, so a typo cannot lock you out.

```bash
sudo tee /etc/ssh/sshd_config.d/10-insis.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers <your-admin-user> deploy
MaxAuthTries 3
LoginGraceTime 20
X11Forwarding no
EOF
sudo sshd -t && sudo systemctl restart ssh
```

Test from a new terminal that your admin login still works before closing the old one.

## 5. The `deploy` user and the deploy script **[later]**

Create the user. No password, no sudo group, no docker group:

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
```

Generate the key **on your laptop**, not on the VM:

```bash
ssh-keygen -t ed25519 -f insis-deploy -C "github-actions deploy" -N ""
```

Put the public key into `/home/deploy/.ssh/authorized_keys` as **one line**:

```
restrict,command="sudo /usr/local/sbin/insis-deploy $SSH_ORIGINAL_COMMAND" ssh-ed25519 AAAA... github-actions deploy
```

`restrict` turns off shell, port forwarding, agent forwarding and terminal. `command=` means whatever the client asks
for, only the deploy script runs, and the client's text (`dev <sha>`) is passed to it as arguments.

```bash
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
```

Allow exactly one command through sudo:

```bash
echo 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/insis-deploy' | sudo tee /etc/sudoers.d/insis-deploy
sudo chmod 440 /etc/sudoers.d/insis-deploy && sudo visudo -c
```

Install the script (once it exists in the repo; update it only after reading the diff):

```bash
sudo install -m 750 -o root -g root deploy/bin/deploy.sh /usr/local/sbin/insis-deploy
```

The script must (see [planning/infra/deployment.md](../planning/infra/deployment.md)):

1. Accept only `^(dev|prod) [0-9a-f]{40}$`.
2. Check the SHA is on `develop` (dev) or `main` (prod), using the GitHub compare API: the status must be `identical` or
   `behind`.
3. Download only `deploy/stacks/app/` of that SHA.
4. Refuse the compose file if a service uses `privileged`, `cap_add`, `network_mode: host`, `pid: host`, `devices`,
   `security_opt` other than `no-new-privileges`, or any bind mount or volume that is not a named volume.
5. Then pull images, run the ETL if needed, `up -d`, wait for `/health`, roll back on failure.

The script runs as root, so it must treat everything it downloads as untrusted input.

## 6. Firewall

Docker publishes container ports by editing iptables itself, **skipping `ufw`**. So there are two layers.

Host layer (`ufw`):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Docker layer. Rules in the `DOCKER-USER` chain run before Docker's own, and are the place to say "only 80 and 443 reach
containers from outside". Find the internet-facing interface first (`ip route show default`, usually `ens192` or `eth0`):

```bash
IF=ens192   # replace with your interface
sudo iptables -I DOCKER-USER -i "$IF" -j DROP
sudo iptables -I DOCKER-USER -i "$IF" -p tcp -m conntrack --ctorigdstport 443 -j ACCEPT
sudo iptables -I DOCKER-USER -i "$IF" -p tcp -m conntrack --ctorigdstport 80 -j ACCEPT
sudo iptables -I DOCKER-USER -i "$IF" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo netfilter-persistent save
```

Result, top to bottom: replies to connections the VM started, then ports 80 and 443, then everything else from outside
is dropped. If someone later adds a `ports:` line to a compose file by mistake, it stays unreachable.

## 7. Docker daemon

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "no-new-privileges": true,
  "live-restore": true
}
EOF
sudo systemctl restart docker
```

Restarting Docker restarts containers. Do this before the stacks run, or in a quiet moment.

## 8. Directories and secrets

```bash
sudo install -d -m 750 -o root -g root /etc/insis-mcp
sudo install -d -m 750 -o root -g root /srv/insis-mcp /var/lib/insis-mcp
```

Copy `deploy/env/*.env.example` to `/etc/insis-mcp/<name>.env` (`platform`, `monitoring`, `dev`), fill in every empty
value (`openssl rand -hex 24` for passwords) and lock them:

```bash
sudo chown root:root /etc/insis-mcp/*.env && sudo chmod 600 /etc/insis-mcp/*.env
```

Keep a copy of the files in a password manager. The repo never holds real values.

The `deploy` user cannot read these files. Only the root-owned deploy script does.

## 9. Start the shared stacks

Copy `deploy/stacks/platform/` and `deploy/stacks/monitoring/` to `/srv/insis-mcp/` (from a checkout of a reviewed
commit), then:

```bash
cd /srv/insis-mcp
sudo docker compose -p platform -f platform/compose.yml --env-file /etc/insis-mcp/platform.env up -d
sudo docker compose -p monitoring -f monitoring/compose.yml --env-file /etc/insis-mcp/monitoring.env up -d
sudo docker compose -p platform -f platform/compose.yml logs -f traefik     # watch for ACME errors
```

The first certificate is requested when the first router with a `Host(...)` appears, i.e. when the app stack first
starts. Until then Traefik serves its built-in self-signed certificate.

Let's Encrypt validates over port 80, so `bpmcp.vse.cz` must resolve to this VM (it does:
`146.102.18.36`). Certificates renew by themselves about 30 days before expiry and are stored in the `acme` volume.

Grafana is not reachable from the internet. Open it through an SSH tunnel from your laptop:

```bash
ssh -L 3000:localhost:3000 <your-admin-user>@bpmcp.vse.cz
# then open http://localhost:3000 (user admin, password GRAFANA_ADMIN_PASSWORD)
```

## 10. Databases and roles **[later]**

Create `insis_dev`, `etl_dev`, `mcp_dev` and `alloy_monitor`. Script: [README.md § TODO](README.md#todo).

## 11. GitHub settings

Done in the repo's web UI (you, not CI):

1. **Settings → Branches**: protect `main` and `develop`: pull request required, no force pushes, no deletions. Add
   "required status checks" for the CI jobs.
2. **Settings → Environments → `development`**: add secrets `DEPLOY_SSH_KEY` (content of `insis-deploy`),
   `DEPLOY_KNOWN_HOSTS` (output of `ssh-keyscan -t ed25519 bpmcp.vse.cz`, checked against the fingerprint printed on the
   VM by `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`), and variable `DEPLOY_HOST=bpmcp.vse.cz`.
3. Later, **Environment `production`**: same, plus **required reviewers** (yourself), so a prod deploy waits for a click.
4. **Settings → Actions → General**: workflow permissions "Read repository contents", and only allow actions you use.
5. Delete the private key file from your laptop after storing it as a secret.

## 12. Verify from outside

From your laptop (not the VM). All of these are expected results:

```bash
# Redirect from 80 to 443
curl -sI http://bpmcp.vse.cz | head -3                  # 301, Location: https://bpmcp.vse.cz/

# Valid certificate, TLS 1.2+ only
echo | openssl s_client -connect bpmcp.vse.cz:443 -servername bpmcp.vse.cz 2>/dev/null | openssl x509 -noout -issuer -dates
openssl s_client -connect bpmcp.vse.cz:443 -servername bpmcp.vse.cz -tls1_1 </dev/null 2>&1 | grep -i 'alert\|error'   # handshake fails

# Security headers and rate limit (needs the app running)
curl -sI https://bpmcp.vse.cz | grep -i 'strict-transport\|nosniff\|^server'
for i in $(seq 1 300); do curl -s -o /dev/null -w '%{http_code}\n' https://bpmcp.vse.cz; done | sort | uniq -c   # some 429

# Nothing else is open
nmap -Pn -p 1-10000 bpmcp.vse.cz                        # only 22, 80, 443
curl -s -m 5 https://bpmcp.vse.cz/metrics -o /dev/null -w '%{http_code}\n'      # 404

# The deploy key can do nothing else
ssh -i insis-deploy deploy@bpmcp.vse.cz id              # refused by the script, no shell
ssh -i insis-deploy -L 9999:localhost:5432 deploy@bpmcp.vse.cz   # forwarding refused
```

On the VM:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'             # only traefik shows 0.0.0.0:80 and :443; grafana 127.0.0.1:3000
sudo docker compose -p platform ps                       # all healthy
sudo iptables -S DOCKER-USER                             # the four rules from § 6
```

## 13. If the deploy key leaks

1. On the VM, delete its line from `/home/deploy/.ssh/authorized_keys`. The key is dead immediately.
2. Check what ran: `sudo journalctl -u ssh --since "2 days ago" | grep deploy` and `/var/lib/insis-mcp/<env>/deploys.log`.
3. Generate a new key (§ 5), update the GitHub Environment secret.
4. If an unknown commit was deployed: redeploy a known-good SHA with the workflow, rotate the DB passwords in
   `/etc/insis-mcp/*.env` and restart the stacks.

Because the key cannot read secrets or open a shell, steps 1 and 3 are usually enough.

## Known limits

- The script's compose check blocks the obvious ways to escape a container. It is a filter, not a proof. Review every
  change to `deploy/stacks/app/` and to the script itself like a change to a lock.
- Alloy runs with wide read access to the host for metrics and logs. It has no write access to Docker, but anyone who
  controls it can read host files. Keep its image pinned and never publish a port for it.
- The hardened container settings (read-only filesystems, dropped capabilities) are untested on a real run. If a
  container fails to start after a change, check its log for "read-only file system" or "operation not permitted" and
  add back only the one permission it names.
