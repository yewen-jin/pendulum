# Ableton → bridge setup

## Recommended: MIDI→OSC Node sender

The working approach for the two-machine setup. Runs on the Mac mini alongside Ableton, reads the MIDI controller via USB, and forwards CC/note data as OSC to the ROG bridge.

```sh
cd sender && npm install
BRIDGE_HOST=<rog_ip> npm start
```

Sends `/midi/cc/<N>` (float 0..1), `/midi/note` (impulse), `/midi/velocity`, `/midi/pitch`. See `sender/midi-to-osc.mjs` for details.

For single-machine testing (controller plugged into the same machine running visuals), Web MIDI in the browser handles this automatically — no sender needed.

## AbletonOSC (future — not yet functional)

<https://github.com/ideoforms/AbletonOSC>

Installed on Mac mini but **not wired up**. Key issues discovered:

1. **No `config.py`** — configuration lives in `constants.py` (`CLIENT_PORT`, `SERVER_PORT`, etc.), not a separate config file.
2. **Request-response model** — AbletonOSC does not continuously broadcast state. You must send a request (e.g. `/live/song/get/tempo`) and it replies once per request. For continuous data you need to either poll or use its `/live/*/start_listen` subscription endpoints.
3. **Subscription logic not written** — someone needs to write a client that subscribes to the desired Ableton parameters and re-emits them as the flat OSC paths our bridge expects (see `docs/osc-addresses.md`).

This is **low priority** — the MIDI sender already covers CC and note data, which is the primary Ableton→visual control path. AbletonOSC would only add transport data (tempo, beat position, clip state) if we find a use for it in scenes.

### Setup steps (for when we revisit)

1. Clone into Ableton's Remote Scripts: `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC`
2. Ableton → Preferences → Link / Tempo / MIDI → Control Surface: add `AbletonOSC`
3. Edit `AbletonOSC/constants.py` to set `CLIENT_PORT` (where replies go) and `SERVER_PORT` (where it listens)
4. Write a subscription client that calls `/live/song/start_listen/tempo` etc. and relays to our bridge at `<rog_ip>:9000`

## Max for Live device (abandoned)

A `.maxpat` was written (`ableton/pendulum-midi.maxpat`) but **does not work** — the user's Ableton-bundled Max is missing the `oscformat` object. This approach is superseded by the Node sender above. Kept as reference only.

## Network

Both machines on the **same travel router**. Assign static IPs via the router's DHCP reservation so the OSC destination never changes between gigs. Test from the Mac mini:

```sh
nc -u <rog_ip> 9000   # any text, bridge logs will show it arriving (once broadcast)
```
