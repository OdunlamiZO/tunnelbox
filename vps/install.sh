#!/usr/bin/env bash
# Run once as root. Expects the helper at /root/tunnelbox-helper (copied with scp).
# Usage: install.sh ADMIN_USER TUNNEL_USER 'ADMIN_PUBLIC_KEY'
set -euo pipefail

fail() {
  echo "install.sh: $*" >&2
  exit 1
}

[[ $(id -u) -eq 0 ]] || fail "run this as root"
[[ $# -eq 3 ]] || fail "usage: install.sh ADMIN_USER TUNNEL_USER 'ADMIN_PUBLIC_KEY'"

ADMIN_USER=$1
TUNNEL_USER=$2
ADMIN_PUBLIC_KEY=$3
HELPER_SOURCE=/root/tunnelbox-helper
HELPER_PATH=/usr/local/sbin/tunnelbox-helper

user_pattern='^[a-z_][a-z0-9_-]{0,31}$'
key_pattern='^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)) [A-Za-z0-9+/]+={0,3}( [A-Za-z0-9._@+-]+)?$'

[[ $ADMIN_USER =~ $user_pattern && $ADMIN_USER != root ]] || fail "invalid administrator user: $ADMIN_USER"
[[ $TUNNEL_USER =~ $user_pattern && $TUNNEL_USER != root ]] || fail "invalid tunnel user: $TUNNEL_USER"
[[ $ADMIN_USER != "$TUNNEL_USER" ]] || fail "the administrator and tunnel users must be different"
[[ $ADMIN_PUBLIC_KEY =~ $key_pattern ]] || fail "invalid administrator public key"
[[ -f $HELPER_SOURCE ]] || fail "copy the helper to $HELPER_SOURCE first"

echo "==> Installing $HELPER_PATH"
install -o root -g root -m 755 "$HELPER_SOURCE" "$HELPER_PATH"
rm -f "$HELPER_SOURCE"

echo "==> Administrator user $ADMIN_USER"
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$ADMIN_USER"
fi

admin_home=$(getent passwd "$ADMIN_USER" | cut -d: -f6)
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "$admin_home/.ssh"
touch "$admin_home/.ssh/authorized_keys"
grep -qxF "$ADMIN_PUBLIC_KEY" "$admin_home/.ssh/authorized_keys" || printf '%s\n' "$ADMIN_PUBLIC_KEY" >>"$admin_home/.ssh/authorized_keys"
chown "$ADMIN_USER:$ADMIN_USER" "$admin_home/.ssh/authorized_keys"
chmod 600 "$admin_home/.ssh/authorized_keys"

echo "==> Allowing $ADMIN_USER to run only the helper as root"
sudoers_file=/etc/sudoers.d/tunnelbox
printf '%s ALL=(root) NOPASSWD: %s\n' "$ADMIN_USER" "$HELPER_PATH" >"$sudoers_file.tmp"
chmod 440 "$sudoers_file.tmp"
visudo -cf "$sudoers_file.tmp" >/dev/null || {
  rm -f "$sudoers_file.tmp"
  fail "the sudo rule failed validation"
}
mv "$sudoers_file.tmp" "$sudoers_file"

echo "==> Tunnel user $TUNNEL_USER"
install -d -m 755 /etc/tunnelbox
printf '%s\n' "$TUNNEL_USER" >/etc/tunnelbox/tunnel-user
chmod 644 /etc/tunnelbox/tunnel-user
"$HELPER_PATH" prepare

echo "==> Done. From your Mac, check: ssh -o BatchMode=yes $ADMIN_USER@<vps> sudo -n $HELPER_PATH version"
