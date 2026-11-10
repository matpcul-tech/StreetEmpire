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

## The DJ, the ads and the news

Between songs the radio shows a line on screen: a DJ line, an ad for a business that does not exist, or news about something you just did (a car you blew up, a block you took, a stunt jump). The lines live at the top of `src/radio.js` in `DJ` and `ADS`. Add, cut or rewrite them there. Keep every business made up.

### Recorded drops

A station can also play short recorded clips between songs: your own voice as the DJ, a station ID, a fake ad. Add a `drops` list to the station:

```json
{
  "name": "King Rando Radio",
  "tracks": [ { "title": "We in the Club", "file": "king-rando/we-in-the-club.mp3" } ],
  "drops": [
    { "file": "king-rando/drops/station-id.mp3", "text": "King Rando Radio. Do not touch that dial." },
    { "file": "king-rando/drops/pawn-ad.mp3", "text": "Pawn Counter. Your stuff, our prices." }
  ]
}
```

After each song one drop plays, then the next song. `text` is optional and shows on screen while the clip plays. Keep a drop under 15 seconds and under 300 KB.

Lines worth recording first, 5 to 10 seconds each:

1. "You are locked in to King Rando Radio. Do not touch that dial."
2. "King Rando Radio. Louder than your neighbor, quieter than his car."
3. "Shout out to everybody stuck on the Loop right now."
4. "Pawn Counter. Your stuff, our prices."
5. "Loop Mutual Insurance. We cover everything except what happens."
6. "A message from City Hall: the orange ramps are not for stunts."
