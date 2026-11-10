# Car radio

The radio plays while you are in a car. **RADIO** on a phone, **M** on a keyboard, steps through the stations and then off. The station you pick is remembered on the device.

## Built-in stations

Three stations are made in code with WebAudio (`src/radio.js`): a drum machine, a bass line and a chord stab, written as patterns. They are original, add nothing to the download, and are there so the radio works before any track is added.

| Station | Feel |
|---|---|
| Eastside Low | 88 bpm, swung, sine bass |
| Downtown Pulse | 118 bpm, four on the floor |
| Harbor Static | 74 bpm, slow and sparse |

## Adding your own tracks

Track stations come first on the dial. They are listed in `public/radio/stations.json`:

```json
{
  "stations": [
    {
      "name": "King Rando Radio",
      "tracks": [
        { "title": "Track One", "file": "king-rando/track-one.mp3" },
        { "title": "Track Two", "file": "king-rando/track-two.mp3" }
      ]
    }
  ]
}
```

1. Put the audio files under `public/radio/`, in a folder per station.
2. Add the station and its tracks to `stations.json`. `file` is the path under `public/radio/`.
3. Commit. Nothing else changes.

Notes:

- Tracks are streamed one after another when the station is on. They are never downloaded up front, so a long playlist does not slow the game's first load.
- MP3 at 128 kbps is about 1 MB a minute and plays on every phone. Keep a track under about 5 MB.
- Only use music you hold the rights to for game use. A streaming distribution deal usually does not cover it for leased beats, uncleared samples or co-writers who have not agreed.
- A station with no tracks, or a file that fails to load, is skipped.
