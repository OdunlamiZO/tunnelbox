# tunnelbox

A local dashboard for exposing apps running on your Mac at public HTTPS URLs, through SSH reverse tunnels to your own VPS.

```
https://myapp.duckdns.org → nginx on the VPS → SSH tunnel → tunnelbox request log → localhost:<port> on your Mac
```

From the dashboard you can:

- start and stop each tunnel with a switch (a dropped connection reconnects on its own while the switch is on)
- add a tunnel: tunnelbox logs in to the VPS and creates the nginx site, the HTTPS certificate, and the port permission
- edit a tunnel's name, local port, or domain
- delete a tunnel, which removes its nginx site, certificate, and port permission from the VPS
- see every request that comes through a tunnel: method, path, status, response time, and client IP
- follow each tunnel's connection activity, and copy URLs and logs with one click
- switch between light and dark themes

Tunnels only start when you switch them on. The dashboard itself can start automatically at login (see below).

## Requirements

- macOS with Node.js 20 or newer
- A VPS running Ubuntu or Debian with nginx, ports 80 and 443 open
- Root access to the VPS once, to install tunnelbox's helper
- A domain (or a free DuckDNS subdomain) per tunnel, pointing at the VPS

## Install

```bash
cd path/to/tunnelbox
npm install
npm run build
npm run serve
```

Open http://localhost:4600. Stop it with Ctrl+C.

## First-time setup

The commands below use your VPS's IP address or hostname. Set it once in each terminal you use for these steps:

```bash
VPS_HOST=203.0.113.10
```

tunnelbox logs in to the VPS as `tunnelbox-admin`, a user that can run only one program as root: `/usr/local/sbin/tunnelbox-helper`. The helper manages tunnelbox's own nginx sites, certificates, and tunnel user, and nothing else.

### 1. Administrator key

Create a key for `tunnelbox-admin` (choose a passphrase when asked):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/tunnelbox_admin -C "tunnelbox-admin"
```

Save its passphrase in the macOS Keychain:

```bash
ssh-add --apple-use-keychain ~/.ssh/tunnelbox_admin
```

Tell SSH to use this key when logging in to the VPS as `tunnelbox-admin`, and to read its passphrase from the Keychain:

```bash
printf '%s\n' '' \
"Match host $VPS_HOST user tunnelbox-admin" \
'    IdentityFile ~/.ssh/tunnelbox_admin' \
'    UseKeychain yes' \
'    AddKeysToAgent yes' >> ~/.ssh/config
```

The Keychain applies only to `tunnelbox-admin`; logins as other users on the VPS keep asking for their key's passphrase.

### 2. Tunnel key

The tunnels use a second key, which can only open the tunnel ports on the VPS — it can't open a shell. It has no passphrase so tunnels can reconnect on their own:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/tunnelbox_tunnel -C "tunnelbox-tunnel" -N ""
```

tunnelbox installs it on the VPS for you (see **Prepare VPS** below).

### 3. Install the helper on the VPS

Run these from the tunnelbox folder. They log in as root once, to create `tunnelbox-admin`, install the helper, and allow `tunnelbox-admin` to run it:

```bash
scp vps/tunnelbox-helper root@$VPS_HOST:/root/tunnelbox-helper
ssh root@$VPS_HOST "bash -s -- tunnelbox-admin tunnel '$(cat ~/.ssh/tunnelbox_admin.pub)'" < vps/install.sh
```

Check that tunnelbox can log in and run the helper with no prompt at all:

```bash
ssh -o BatchMode=yes tunnelbox-admin@$VPS_HOST sudo -n /usr/local/sbin/tunnelbox-helper version
```

It prints `1`. After updating tunnelbox, run the two install commands again to update the helper.

### 4. VPS settings

In the dashboard, open **Settings** and fill in:

| Field                      | Value                                     |
| -------------------------- | ----------------------------------------- |
| VPS host                   | the same value as `VPS_HOST`              |
| Administrator user         | `tunnelbox-admin`                         |
| Tunnel user                | `tunnel`                                  |
| Tunnel key                 | `~/.ssh/tunnelbox_tunnel`                 |
| Certificate email          | your email (Let's Encrypt expiry notices) |
| First VPS port for tunnels | `9080`                                    |

**Tunnel user** must be the same name you passed to `install.sh` (`tunnel` above): the helper manages that user, and the tunnels log in as it.

Click **Save**, then click **Prepare VPS**: it installs the tunnel key and the SSH keep-alive settings. It is safe to run again.

### Optional: turn off root SSH login

tunnelbox doesn't need root login once the helper is installed. Turn it off only if you have another way to act as root on the VPS, such as a user with full `sudo` or your provider's web console — otherwise you can lock yourself out:

```bash
ssh root@$VPS_HOST "printf 'PermitRootLogin no\n' > /etc/ssh/sshd_config.d/10-no-root-login.conf && sshd -t && systemctl reload ssh"
```

To turn it back on, delete `/etc/ssh/sshd_config.d/10-no-root-login.conf` as root and reload ssh.

## Adding a tunnel

1. Create the domain first. For DuckDNS: add a subdomain at duckdns.org and set its **current ip** to the VPS IP.
2. Check it resolves: `dig +short A myapp.duckdns.org` prints the VPS IP.
3. In the dashboard, click **Add tunnel** and enter a name, the domain, and the local port your app uses.
4. A log window shows the VPS setup. When it says **Done**, switch the tunnel on.

If setup fails (for example, DNS isn't pointing at the VPS yet), fix the cause and click **Finish VPS setup** on the tunnel.

## Request log

Each tunnel card has two strips:

- **Requests** — every request that reached your app through the tunnel, newest first: time, method, path, status, response time, and client IP. The collapsed strip shows the latest one; hover a path to see it in full.
- **Activity** — the tunnel's connection history: connecting, connected, reconnecting, and errors.

If your app isn't running, requests show as `502` with "nothing is listening on localhost:<port>", and visitors get the same message.

The last 100 requests per tunnel are kept in memory; they're cleared when the dashboard restarts.

## Editing and deleting

- **Edit** changes the name and local port straight away; a running tunnel restarts on the new port. Changing the domain sets up the new domain on the VPS first, then removes the old one.
- **Delete** stops the tunnel and removes its nginx site, certificate, and port permission from the VPS. Other sites on the VPS are not touched.

## Start the dashboard automatically at login

This starts the dashboard (not the tunnels) whenever you log in, and restarts it if it stops.

Build the UI first, then create the launch agent:

```bash
cd path/to/tunnelbox
npm run build

NODE_PATH_FOR_TUNNELBOX=$(which node)
PROJECT_PATH=$(pwd)

printf '%s\n' \
'<?xml version="1.0" encoding="UTF-8"?>' \
'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' \
'<plist version="1.0">' \
'<dict>' \
'    <key>Label</key><string>com.tunnelbox.dashboard</string>' \
'    <key>ProgramArguments</key>' \
'    <array>' \
"        <string>$NODE_PATH_FOR_TUNNELBOX</string>" \
"        <string>$PROJECT_PATH/node_modules/tsx/dist/cli.mjs</string>" \
"        <string>$PROJECT_PATH/server/main.ts</string>" \
'    </array>' \
"    <key>WorkingDirectory</key><string>$PROJECT_PATH</string>" \
'    <key>EnvironmentVariables</key>' \
'    <dict><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string></dict>' \
'    <key>RunAtLoad</key><true/>' \
'    <key>KeepAlive</key><true/>' \
"    <key>StandardOutPath</key><string>$HOME/Library/Logs/tunnelbox.log</string>" \
"    <key>StandardErrorPath</key><string>$HOME/Library/Logs/tunnelbox.log</string>" \
'</dict>' \
'</plist>' > ~/Library/LaunchAgents/com.tunnelbox.dashboard.plist

plutil -lint ~/Library/LaunchAgents/com.tunnelbox.dashboard.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tunnelbox.dashboard.plist
```

Check it's running: open http://localhost:4600.

Managing it:

```bash
# status
launchctl print gui/$(id -u)/com.tunnelbox.dashboard | grep state

# logs
tail -f ~/Library/Logs/tunnelbox.log

# restart (after pulling changes, run npm run build first)
launchctl kickstart -k gui/$(id -u)/com.tunnelbox.dashboard

# stop and turn off auto-start
launchctl bootout gui/$(id -u)/com.tunnelbox.dashboard
rm ~/Library/LaunchAgents/com.tunnelbox.dashboard.plist
```

The launch agent records the Node.js path at the time you create it. If you switch Node versions with nvm and remove the old one, run the steps above again.

## Security

- The dashboard listens on `127.0.0.1` only; other devices on your network can't reach it.
- Requests must use a local host name (`localhost` or `127.0.0.1`), and requests that change anything must come from the dashboard itself. Other websites open in your browser can't control it.
- No passwords or private keys are stored. The configuration holds the VPS host, user names, the path to the tunnel key, and the certificate email.
- The administrator key can't act as root on the VPS: `tunnelbox-admin` can run only the helper, which checks every value it receives and changes only nginx sites named `tunnelbox-…`, their certificates, and the tunnel user's key.
- The tunnel key can only open the specific localhost ports listed for it on the VPS; it can't open a shell.
- While a tunnel is on, the app behind it is reachable from the internet. Switch tunnels off when you don't need them.

## Files

| Path                                                  | What it is                                      |
| ----------------------------------------------------- | ----------------------------------------------- |
| `~/.tunnelbox/configuration.json`                     | VPS settings and tunnels (readable only by you) |
| `~/Library/Logs/tunnelbox.log`                        | Dashboard log when started at login             |
| `/etc/nginx/sites-available/tunnelbox-<domain>` (VPS) | nginx site created for each tunnel              |
| `/usr/local/sbin/tunnelbox-helper` (VPS)              | the only program `tunnelbox-admin` runs as root |
| `/etc/sudoers.d/tunnelbox` (VPS)                      | allows `tunnelbox-admin` to run the helper      |
| `/etc/tunnelbox/tunnel-user` (VPS)                    | the tunnel user the helper manages              |

Set `TUNNELBOX_HOME` to keep the configuration somewhere other than `~/.tunnelbox`.

## Troubleshooting

| Symptom                                                            | Fix                                                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Tunnel shows **Error: Permission denied**                          | The tunnel key isn't accepted. Open Settings and click **Prepare VPS** to reinstall it.                                    |
| Tunnel keeps **Reconnecting** with "remote port forwarding failed" | An old connection still holds the port on the VPS. It clears within about 90 seconds.                                      |
| Requests show `502` "nothing is listening on localhost:…"          | Your app isn't running on the tunnel's local port. Start it, or **Edit** the tunnel's local port.                          |
| VPS job fails at "Checking … points to"                            | The domain's DNS doesn't point at the VPS yet. Fix DNS, then **Finish VPS setup**.                                         |
| VPS job fails with "Permission denied (publickey)"                 | Key login as `tunnelbox-admin` isn't set up, or its passphrase isn't in the Keychain. See First-time setup, steps 1 and 3. |
| VPS job fails with "sudo: a password is required"                  | The helper isn't installed, or Settings has a different administrator user. See First-time setup, step 3.                  |
| Deleting a tunnel fails with "not a tunnelbox site"                | The tunnel's nginx site wasn't created by tunnelbox. Remove it on the VPS as root, then delete the tunnel again.           |

## How it works

```
Internet ─▶ nginx (VPS :443) ─▶ 127.0.0.1:<VPS port> ─▶ SSH reverse tunnel ─▶ request proxy (Mac) ─▶ localhost:<app port>
```

- Switching a tunnel on starts a small HTTP proxy on a free local port, then runs `ssh -R` as the tunnel user so the tunnel's VPS port forwards to that proxy. The proxy records each request and passes it to your app unchanged, including WebSocket upgrades and streaming responses.
- Adding, editing, and deleting a tunnel log in to the VPS as `tunnelbox-admin` and run the helper through `sudo`. The helper writes or removes the nginx site, runs certbot, and updates the tunnel user's `authorized_keys` so the tunnel key can only listen on its tunnels' ports.
- Settings and tunnels are stored in `~/.tunnelbox/configuration.json`. Tunnel status, activity, and request logs are kept in memory.

## Development

```
server/   Fastify API, tunnel manager, request proxy, helper commands
web/      React dashboard (Vite, Tailwind CSS, TanStack Query)
vps/      tunnelbox-helper and install.sh, which run on the VPS
```

```bash
npm run dev         # server on :4600 with reload, UI on http://localhost:5173
npm test            # unit tests
npm run typecheck
npm run format
```
