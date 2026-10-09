#!/bin/bash
# Equilibra o volume das músicas de combate (mesma sonoridade percebida) e gera MP3 leve.
# uso: tools/audio/normalize.sh arquivo1 arquivo2 arquivo3 arquivo4
set -e
out=client/public/audio/music
mkdir -p "$out"
i=1
for src in "$@"; do
  # tira o silêncio do começo e do fim (para a música repetir sem buraco)
  f=$(mktemp --suffix=.wav)
  ffmpeg -y -hide_banner -loglevel error -i "$src" -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,afade=t=in:d=0.03" "$f"
  # 2 passadas de loudnorm (EBU R128): -16 LUFS, pico -1.5 dBTP
  m=$(ffmpeg -hide_banner -i "$f" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
  ii=$(echo "$m" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_i'])")
  tp=$(echo "$m" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_tp'])")
  lra=$(echo "$m" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_lra'])")
  th=$(echo "$m" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_thresh'])")
  ffmpeg -y -hide_banner -loglevel error -i "$f" -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$ii:measured_TP=$tp:measured_LRA=$lra:measured_thresh=$th:linear=true" -ar 44100 -ac 2 -codec:a libmp3lame -b:a 128k "$out/combat-$i.mp3"
  echo "combat-$i.mp3 ← $src (antes: $ii LUFS, $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/combat-$i.mp3")s)"
  rm -f "$f"
  i=$((i+1))
done
