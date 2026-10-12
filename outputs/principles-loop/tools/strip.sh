#!/usr/bin/env bash
# tools/strip.sh name f1,f2,... [cols] -> out/strip_<name>.png (renders the stills, tiles them with frame labels)
set -e
name=$1; frames=$2; cols=${3:-4}
node tools/render.mjs --stills "$frames" > /dev/null 2>&1
inputs=(); labels=""; i=0
IFS=',' read -ra F <<< "$frames"
n=${#F[@]}
for f in "${F[@]}"; do p=$(printf "out/stills/f%03d.png" "$f"); inputs+=(-i "$p"); labels+="[$i:v]scale=360:360,drawtext=text='$f':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6[v$i];"; i=$((i+1)); done
layout=""; for ((k=0;k<n;k++)); do c=$((k%cols)); r=$((k/cols)); layout+="$((c*360))_$((r*360))|"; done
stack=""; for ((k=0;k<n;k++)); do stack+="[v$k]"; done
ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" -filter_complex "${labels}${stack}xstack=inputs=$n:layout=${layout%|}" "out/strip_$name.png"
echo "out/strip_$name.png"
