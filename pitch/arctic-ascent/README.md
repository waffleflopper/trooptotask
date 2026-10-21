# Arctic Ascent opener — TroopToTask

A 2:20 scored opener for the five-minute pitch. Every scene boundary is a downbeat of the music (1.8-second bars), so the big hits land on WHO'S READY, the logo, Personnel details, WHAT'S NEXT, READINESS and the end logo.

- `video.html`: the composition. Open it in a browser to scrub and preview.
- `render.mjs`: `node render.mjs` writes the silent `out/troop-to-task-arctic-ascent.mp4` (1080p30, about a minute). `--stills 12 50` writes review frames; `--fps 60` renders at 60 fps.
- `audio.py`: builds the soundtrack (music edit, synthesized sound design, mix and master). Run it with `~/.cache/t2t-pitch-audio/venv/bin/python audio.py` (about 3 seconds).
- `assets/`: Paper mockups (TroopToTask file), the live training screenshots, brand fonts and the music source. `assets/live/` holds captures of the shipped app (origin/main, 20 Oct 2026) with synthetic data: Calendar and its duty picker, Personnel details (Overview, Readiness, Log), Training, Training reports, the roster and Home.

## Outputs (`out/`)

| File | What it is |
| --- | --- |
| `troop-to-task-arctic-ascent-final.mp4` | **Play this one.** Music plus sound design (whooshes, booms, typing, pings, the Drop Zone mic and approve sounds). |
| `troop-to-task-arctic-ascent-music-only.mp4` | Music edit with no sound effects, in case the effects feel like too much in the room. |
| `troop-to-task-arctic-ascent.mp4` | Silent picture. |
| `soundtrack.wav`, `soundtrack-music-only.wav` | Mastered mixes (-14 LUFS, -1 dBFS peak), 48 kHz / 24-bit. |
| `music.wav`, `sfx.wav`, `voice.wav` | Unmastered stems for remixing elsewhere. |

To change levels, edit the `level_db` arguments to `put(...)` or the `sfx * db(-3)` balance in `audio.py`, rerun it and re-mux:

```sh
ffmpeg -y -i out/troop-to-task-arctic-ascent.mp4 -i out/soundtrack.wav -map 0:v -map 1:a -c:v copy \
  -c:a aac -b:a 320k -ar 48000 -shortest -movflags +faststart out/troop-to-task-arctic-ascent-final.mp4
```

## Arc

The thesis: leaders spend hours chasing answers scattered across trackers. TroopToTask gets them there in seconds, and the time saved goes back to training Soldiers. That's readiness.

| Time | Beat | On screen |
| --- | --- | --- |
| 0:00 | Cold open | 0547 · First formation. "Every leader needs one answer." → **WHO'S READY?** (hit) |
| 0:04 | The old way | Leave tracker v7, DTMS export, group chats, whiteboard, sticky notes and inbox pile up while the clock races. "Scattered across every tracker." |
| 0:13 | Logo | Everything collapses into **TROOPTOTASK** as the drums enter |
| 0:17 | Available today | Dashboard → Calendar → Training matrix → Training reports (79% → 63% if no one renews, the 180-day forecast) |
| 0:31 | Scoped access | Commander · 1SG → Platoon Sergeant → Squad Leader → Team Leader. The music drops into its break under "Every leader owns their piece." |
| 0:45 | Personnel details | **Just shipped**, on the music's re-entry: the camera leaves the team leader's Soldiers for one Soldier's page, then what needs action, most urgent first |
| 0:54 | What's next | In design now · built on the same foundation |
| 0:58 | Drop Zone | Robert's recorded brain dump plays as the music ducks under a filter; the transcript types in time with his words and the waveform follows his voice. It becomes three reviewed changes, approved at 0:11 on the stopwatch; approval launches the closing section |
| 1:14 | Events & Taskings | Taskings list → Alpha-scoped staffing |
| 1:23 | AI across the platform | One verb per two bars (3.6 seconds): Ask, Brief, Forecast, Fill, each with a one-line question and answer, then the recap |
| 1:39 | Bookend | The cold open returns: 0547 · First formation, **WHO'S READY?** The music muffles, then opens as the dashboard answers it on one screen: 0548 · Answered. Before formation. |
| 1:50 | Testimonials | "From leaders using it today": three quotes stamped down line by line on the beat, each with its attribution, while a row fills in JBER, Alaska · Grafenwöhr, Germany · Fort Bliss, Texas. The SFC's "all my day with the Soldiers" hands straight to the close |
| 2:05 | Close | Less time on admin. More time with Soldiers. The music drops out under "That's", slams on **READINESS** (2:10), and the tagline builds through the swell to the end logo on the final hit (2:16) |

## Slides

The deck picks up where the opener leaves off, with one slide per feature area for the deeper talk. It shares the video's type and color, and its status chips mark what's shipped and what's planned.

| # | Slide | Status |
| --- | --- | --- |
| 1 | Holding slide (TroopToTask · SSG Robert Baddeley, MEDDAC-AK · Arctic Ascent 2026) | |
| 2 | The opener (plays the final video) | |
| 3 | Calendar: Who's where. Every day. | Available today |
| 4 | Personnel details: Every Soldier. One page. | Just landed |
| 5 | Training & Training reports: Project drop-offs, maximize training impact. | |
| 6 | Events & Taskings: Every tasking. Tracked to done. | In design |
| 7 | Drop Zone & AI: Just say it. | In development |
| 8 | Security & access: Built to maximize security. | |
| 9 | Close: Less time on admin. More time with Soldiers. That's readiness. | |

- `deck.html`: open it in Chrome and press F for full screen. → / Space / PageDown (most clickers) advance; ← goes back. The opener slide plays the video with sound when you land on it.
- `deck-render.mjs`: `node deck-render.mjs` writes `out/slides/slide-NN.png`, the slide list and `out/troop-to-task-arctic-ascent-slides.pdf`.
- `deck-pptx.py`: `~/.cache/t2t-pitch-audio/venv/bin/python deck-pptx.py` builds `out/troop-to-task-arctic-ascent-slides.pptx` from those images, with the video embedded on slide 2 (click once on that slide to start it).

The deck carries no speaker notes; Robert keeps his own talk track.

## Music

"[Vanguard](https://www.scottbuckley.com.au/library/vanguard/)" by Scott Buckley, released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Commercial use and edits are allowed with attribution. The end card carries the credit; in slides, descriptions or written materials use his format: *'Vanguard' by Scott Buckley – released under CC-BY 4.0. www.scottbuckley.com.au*

The 3:54 track is cut down to three bar-aligned pieces with nothing repeated: the intro build (video 0:00–0:41.8), the break and melodic middle (to 0:58), and the closing section through the composer's own ending, entering as Drop Zone's low-pass closes over the cut. Each cut hands over 10–35 ms before a downbeat. The music is low-passed under Drop Zone's speaking beat and the bookend's question, and fades under the end card. The offsets are in `audio.py`.

## Optional voiceover (≈130 words)

The video stands on its own, and the Drop Zone line is already Robert's own recording (`assets/voice/drop-zone-robert.m4a`; `audio.py` reads the decoded `.wav`). Its word timings are in `DZ_WORDS` in `video.html`; a re-recorded take needs new timings there and in `DZ_ENV`.

> Every morning, every leader needs one answer: who's ready?
> The answer exists. It's in a leave tracker, a training export, three group chats and a whiteboard.
> TroopToTask puts it in one place. Who's where, every day. Training that never expires quietly.
> And it works the way the Army does. The commander sees the company. The platoon sergeant sees their platoon. The team leader keeps their Soldiers current.
> Next: Drop Zone. Just say what happened, and TroopToTask turns it into updates you approve.
> Events and taskings, staffed and tracked to done. AI that answers questions, builds the brief and flags what expires before the next big event.
> Less time on admin. More time with Soldiers. That's readiness.

## Before showing judges

- Play it once on the room's speakers. Sound effects that feel right on headphones can be too loud on a PA; the music-only version is the fallback.
- Personnel details shipped on 19 October 2026 and is labeled "Just shipped" in the video and "Just landed" on its slide. Drop Zone, Events & Taskings and the AI tiles are labeled "Next", "In design" or "In development". They show planned work, not shipped features.
- The racing clock and the Drop Zone stopwatch are dramatizations. Swap in a real number if you have one (for example, your own time to build a training meeting slide deck).
- If CPT Zugg agrees, quote the October 2026 feedback asking for a "brain dump" AI in the live pitch. It shows that a commander asked for Drop Zone.
- Before showing it, confirm the CPT and SFC are comfortable being quoted with their rank and unit (no names are shown). The 18th CSSB quote is anonymous and credited to the battalion only.
- The Training reports shot is the live page for Kamish SCMH (unit name, Group names and percentages; no Soldier names). Apart from it and the testimonials, all names, units and numbers are the synthetic data from the Paper mockups. The video's Personnel details shots stay on the Paper mockup of SGT Okafor so the Soldier matches the scope zoom and your Drop Zone line; the shipped page has the same sections. The slides use the live captures in `assets/live/` (synthetic Soldiers, C Co, 526th BSB) for Calendar, Personnel details and the Training matrix, plus the Kamish SCMH Training reports shot.
