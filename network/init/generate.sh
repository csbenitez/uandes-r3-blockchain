#!/bin/bash
# Corre UNA vez dentro de un contenedor Besu efímero: genera genesis + llaves de los 4 validadores.
set -euo pipefail
OUT=/out
CONSENSUS="${CONSENSUS:-qbft}"

if [ -f "$OUT/genesis.json" ]; then
  echo "[init] Ya existe $OUT/genesis.json; no se regenera (usa 'taller.ps1 reset')."
  exit 0
fi

rm -rf /tmp/net
besu operator generate-blockchain-config \
  --config-file="/cfg/${CONSENSUS}ConfigFile.json" \
  --to=/tmp/net \
  --private-key-file-name=key

i=1
for d in /tmp/net/keys/*/; do
  mkdir -p "$OUT/node$i"
  cp "$d/key" "$d/key.pub" "$OUT/node$i/"
  echo "[init] node$i -> $(basename "$d")"
  i=$((i + 1))
done
cp /tmp/net/genesis.json "$OUT/genesis.json"

pub=$(sed 's/^0x//' "$OUT/node1/key.pub")
echo "enode://${pub}@172.16.239.11:30303" > "$OUT/bootnode"
echo "[init] bootnode: $(cat "$OUT/bootnode")"
chmod -R a+rX "$OUT"
