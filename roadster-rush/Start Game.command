#!/bin/bash
# Double-click to play: starts a local web server in this folder and opens the game in your browser.
cd "$(dirname "$0")"
PORT=8123
while lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT+1)); done
echo "Roadster Rush is running at http://localhost:$PORT  (close this window to stop it)"
( sleep 1; open "http://localhost:$PORT" ) &
python3 -m http.server $PORT
