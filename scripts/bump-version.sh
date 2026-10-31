#!/bin/sh
# Bumps the cache-busting version so browsers load the newest JS/CSS after a deploy.
V=$(date +%Y%m%d%H%M)
cd "$(dirname "$0")/.."
sed -i -E "s#(style\.css|app\.js)\?v=[0-9]+#\1?v=$V#g" index.html
sed -i -E "s#(scryfall|archidekt)\.js\?v=[0-9]+#\1.js?v=$V#g" js/app.js
echo "version $V"
