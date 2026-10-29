#!/bin/bash
# Arranque de un nodo: start.sh <n>
set -euo pipefail
N="$1"
IP="172.16.239.1$N"
ARGS=(
  --config-file=/etc/besu/config.toml
  --genesis-file=/net/genesis.json
  --node-private-key-file="/net/node$N/key"
  --data-path=/data
  --p2p-host="$IP"
  --p2p-port=30303
)
if [ "$N" != "1" ]; then
  ARGS+=(--bootnodes="$(cat /net/bootnode)")
fi
exec besu "${ARGS[@]}"
