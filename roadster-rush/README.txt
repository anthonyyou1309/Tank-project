ROADSTER RUSH - a three-lane endless runner (Three.js)
Inspired by the flying Roadster shown at its October 15, 2026 reveal.

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
  Up / W / Space   Thrust hop. Press again in the air = kickflip.
                   Hold while falling = hover.
  Left / Right     Change lane (side thrusters fire if you are airborne)
  Down / S         Let go of a tunnel ceiling and drop to the floor
  Esc / P          Pause        M   Mute
  Touch            Swipe to steer / thrust / drop, tap = thrust,
                   press and hold = hover

HOW THE REAL CAR MAPS TO THE GAME
  Cold-gas thrusters fed by carbon-overwrapped pressure vessels (COPVs)
      -> every hop, kickflip, hover and mid-air lane shift spends tank
         pressure (the COPV gauge, bottom left).
  The tanks recompress themselves, with no fuel needed
      -> pressure refills while the wheels are on a surface (road, roofs,
         ramps, or a tunnel ceiling). White COPV canisters top it up.
  The 360-degree "kick flip" over a row of Teslas
      -> a second thrust in mid-air rolls the car and gives the extra
         height to clear a semi or land on its roof.
  Downward corner thrusters that cushioned the landing
      -> hold thrust to hover; hard landings are softened automatically.
  Front side-facing thrusters
      -> you can still change lanes while airborne.
  Underbody suction fans (up to 2G) that held it upside down on a ramp
      -> kickflip into a tunnel ceiling and the fans lock on. Drive inverted
         over the floor barricades, dodge the ceiling pipes, and press Down
         to drop.
  Rear thrusters / quoted 0-60 under one second
      -> red Overdrive pickups: a speed burst that smashes through obstacles.

HAZARDS
  Barriers, parked cars   hop over (you can land on car roofs)
  Semis                   take the ramp, or kickflip up onto the roof
  LOW gantry slabs        stay on the road or change lanes
  Tunnels                 enter on the ground (flying into the portal is a
                          crash); barricades block two lanes on the floor,
                          pipes hang from the ceiling
