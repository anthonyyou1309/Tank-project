VIPER STRIKE - helicopter vs tank combat (Three.js)

HOW TO PLAY (Mac)
  Double-click "Start Game.command". The game opens in your browser.
  The first time, macOS may block it: right-click the file > Open > Open.
  Close the Terminal window to stop the game server.

HOW TO PLAY (any computer, from a terminal)
  cd into this folder, then run:
      python3 -m http.server 8123
  and open http://localhost:8123 in Chrome.

Why a server? The game is split into JavaScript modules, which browsers
refuse to load straight from a file:// address. An internet connection is
needed the first time it loads (the 3D engine and fonts come from a CDN).

CONTROLS
  Pilot:  W/S cyclic, A/D pedals/bank, E/Q collective, Mouse aim,
          Left-click gun, Space/Right-click missile (4-round magazine),
          F flares, C camera, Esc pause
  Tank:   W/S throttle, A/D steer, Mouse aim turret, Left-click main gun
          or autocannon, Space/Right-click SAM (Tunguska), F smoke,
          C camera, Esc pause
