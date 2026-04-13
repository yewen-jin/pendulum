# Ableton → bridge setup

Two options. Pick **A** unless you need raw MIDI CC granularity.

## A. AbletonOSC (recommended, no Max coding)

1. Clone <https://github.com/ideoforms/AbletonOSC> into Ableton's Remote Scripts folder. On macOS:
   `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC`
2. In Ableton → Preferences → Link / Tempo / MIDI → Control Surface: add `AbletonOSC`.
3. Edit `AbletonOSC/config.py`:
   - `OSC_LISTEN_PORT = 11000` (inbound from you, rarely used)
   - `OSC_RESPONSE_PORT = 9000` (the bridge)
   - `OSC_CLIENT_ADDR = '<visual_machine_ip>'`
4. Restart Ableton. You should see `AbletonOSC: Listening for OSC on port 11000` in the Log.
5. From a running session, AbletonOSC continuously emits song/track/clip state. Map what you need to the flat paths in `docs/osc-addresses.md` either by (a) subscribing and re-emitting from a Max for Live device, or (b) forking AbletonOSC and renaming handlers.

## B. Max for Live device (for MIDI CC / notes)

Minimal device (place on any MIDI track):

```
[midiin]
 ├── [ctlin]  → [pak /ableton/cc/ 0 0.] → [route /ableton/cc/] → [udpsend <visual_ip> 9000]
 └── [notein] → [t b] → [/ableton/note] → [udpsend <visual_ip> 9000]
```

Scale CC to 0..1 with `/ 127.` before packing.

For transport, use `live.observer` on `live_set beat` → pack into `/ableton/beat` → `udpsend`.

## Network

Both machines on the **same travel router**. Assign static IPs via the router's DHCP reservation so the OSC destination never changes between gigs. Test from the Mac mini:

```sh
nc -u <visual_ip> 9000   # any text, bridge logs will show it arriving (once broadcast)
```
