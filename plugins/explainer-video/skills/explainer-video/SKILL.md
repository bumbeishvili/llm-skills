---
name: explainer-video
description: Make a narrated explainer or guide video of a web app — a cursor that clicks and types through the real UI, a spotlight and a camera that zooms on what each line names, marks drawn on the word that names them, chapters, cover, title and recap cards, diagram/terminal/code scenes, and a voice reading the script (Kokoro 82M on this machine, or ElevenLabs when the user wants a more human read) — recorded with Playwright and built into a web-sized H.264 MP4 with captions, chapters, a transcript, an embed page, a written guide, a print-ready PDF guide and a click-through walkthrough, with the producer's credit on the cover and closing cards. Every line is checked against stills taken as its words are spoken. Use when asked for a product tour, feature preview, onboarding, how-to, CMS guide or demo video of a site or app, a PDF guide to go with one, or to add narration, cursor animation, zooms or callouts to a screen recording. Checks the voice setup first and has the user install the model if it is missing. Start from templates/; playbook.md has the calls, recipes and traps.
---
# Explainer video

A video built the same way every time: a script of short narration lines, voiced, and a
Playwright tour that plays one segment per line against the running app. Frames are
captured at 1920x1080, the build lays the voice under them, a check reports gaps, silences
and chapter problems, and a review puts each line next to the frames shown while it is spoken.

| File | What it does |
|---|---|
| [`setup.sh`](setup.sh) | `--check` reports what is missing; without it, installs the voice, ffmpeg and Playwright |
| [`voice.cjs`](voice.cjs) | voices `narration.json` with Kokoro, keeps each word's start time, re-voices only changed lines |
| [`voice-elevenlabs.cjs`](voice-elevenlabs.cjs) | the same with ElevenLabs, for when the user chooses it; same output, so everything after works unchanged |
| [`tour-kit.cjs`](tour-kit.cjs) | `record()`: the overlay, the camera, capture, and every call a tour script uses |
| [`build.cjs`](build.cjs) | frames + voice → `video.mp4`, plus captions, chapters, transcript, poster, `embed.html` |
| [`verify.cjs`](verify.cjs) | length, gaps between lines, long silences, YouTube chapter rules, `contact-sheet.png` |
| [`review.cjs`](review.cjs) | four stills per line, each labelled with the word being said, tiled into sheets; `--against` lists what changed since an older review |
| [`guide.cjs`](guide.cjs) | from a dry run: `guide.md` (written steps) and `walkthrough.html` (click-through) |
| [`guide-pdf.cjs`](guide-pdf.cjs) | from a dry run: `guide.pdf`, a cover, one sentence and one still per step, a back page |
| [`credit.cjs`](credit.cjs) | the producer's credit from `brand.json`, for the cards and the PDF |
| [`diff-stills.cjs`](diff-stills.cjs) | after a UI change: which segments look different from the approved stills |
| [`templates/`](templates/) | a starter `tour.cjs` and `narration.json`; `brand.json` and its logo (infogr8's credit); `guide.json` (the PDF's cover and sentences) |
| [`playbook.md`](playbook.md) | every call, recipes, planning numbers, and the traps behind each rule |

## 0. Pick the voice, and set it up first

Two voices write the same files (`audio/<id>.wav`, and each word's timing in
`narration.json`), so the tour, build and review work with either:

- **Kokoro 82M, voice `af_heart`**, through mlx-audio on this machine: `voice.cjs`. The
  default. The script never leaves the machine.
- **ElevenLabs**, a cloud voice: `voice-elevenlabs.cjs`. A clearer, more human read, for
  when the user wants one. It sends the script's text to ElevenLabs and needs
  `ELEVENLABS_API_KEY` in the environment (check it is set without printing it). Offer it
  when agreeing the video, say that the text leaves the machine, and use it once the user
  chooses it. The default voice is Matilda, a calm American narration voice;
  `ELEVENLABS_VOICE_ID` picks another.

Changing the voice, including `EXPLAINER_VOICE` for another Kokoro language, is the user's call.

Before anything else, run:

```bash
bash <skill>/setup.sh --check
```

It reads, changes nothing and exits 1 when something is missing. If anything is,
**ask the user to run `bash <skill>/setup.sh` in their own terminal.** It installs into
`~/.cache/explainer-video` (about 1.5 GB): the voice runtime, the 0.4 GB model, a
short-path espeak copy, an ffmpeg with H.264, and Playwright. It ends by voicing a test
line the user can play. Agent-run installs and model downloads are usually blocked by
the permission check, and a half-done install is harder to fix than one the user ran.
Needs an Apple Silicon Mac for Kokoro; elsewhere, say mlx-audio does not run there and
offer ElevenLabs. With ElevenLabs chosen, the Kokoro parts of the check may stay missing;
ffmpeg and Playwright are still needed.

## 1. Agree the video before writing anything

Settle with the user, in a few lines:

- **Audience and goal**: who watches, what they should be able to do after.
- **Length**: Kokoro speaks about 3.2 words a second, and ElevenLabs' default voice read
  the same script 3% slower. With actions and pauses, two minutes holds about 25 lines and
  300 words; one minute, about 13 lines and 140 words.
- **Sections, in order**, and anything to leave out. Over a minute, sections become chapters.
- **Voice**: Kokoro or ElevenLabs (section 0).
- **Where it will play**: a docs page, a video host, social feeds that autoplay muted, a
  README. This decides captions, the frame and the outputs (section 7).
- **The credit**: whose name, logo, version and website go on the cover and closing cards
  and on the PDF guide's cover and back page (`brand.json`; `templates/brand.json` is
  infogr8's). The date it shows is the day the video is built.
- **A PDF guide** to send or print alongside the video, or not (section 7).
- **How to name the product aloud** ("this portal", the product name) and which
  address the intro types. Do not speak URLs or domains unless asked; show them.
- **Demo data**: a demo account and made-up records. Never film a real account or real
  people's data. Serve fixtures by `context.route` if the app has no demo mode.

## 2. Choose the effects that fit this video

The kit has many effects; a good explainer uses few. Start from the base, then add an
effect only where a line needs it, and say which ones you picked when you agree the video.

**The base for every video**: the cursor doing the real actions, and a spotlight or a
camera zoom on the part a line names. Start lines with `t.speak`. Callouts (`t.say`) and
burned-in captions are opt-in, for when the user asks: in client review both covered the
controls the lines were about. `captions.vtt` is written either way, for players that show
captions. The rules for any effect:

- **It points at what the line names, when the line names it.** Fire it with
  `untilWord`. A cue matched to the spoken word in time and place is what makes cues help.
- **One effect at a time.** A camera move, a mark and a spotlight landing together compete
  for the same glance; stagger them across the line or drop one.
- **Nothing decorative.** Motion that carries no meaning lowers what viewers learn; leave
  the confetti, the 3D and the transitions for their own sake out.

| Effect | Use it when | Leave it out when |
|---|---|---|
| Spotlight (`spot`) | one control among many, on a page at full view | the camera is already zoomed on it |
| Camera zoom (`camera.focus`) | the target is small at full view: a number, a field, a badge, a hover toolbar | the line is about the whole page or a layout |
| Follow-cam (`camera.follow`) | the cursor travels a long way while zoomed (a form, a canvas) | the cursor stays in one area |
| Drift (`camera.drift`) | a held shot of 3 s or more with nothing moving | anything else is moving |
| Focus blur (`focus`) | a busy page, one panel matters | the rest of the page is context the viewer needs |
| Circle, underline, marker (`ink`) | a number or word the line says aloud | the spotlight already marks it |
| Note with arrow (`note`, `pulse`) | one data point or spot needs a name | the spot already has a visible label |
| Label callout (`say`) | the user asks for callouts, or a part has no visible name | by default: callouts covered the controls being explained |
| Step badges (`badge`) | a how-to with ordered steps on one screen | the video is a tour, not a task |
| Dim others (`dim`), scrub (`scrub`) | a chart: one series or the trend along a line | the chart has one series and no hover readout |
| Stat card (`stat`) | a headline number the app does not show large | the app's own number is on screen |
| Lower third (`lowerThird`) | naming a screen or a person once | the chapter chip already names it |
| Before/after wipe (`before`, `wipe`) | a setting or edit changes how the page looks, or a second page shows where something appears | the change is too small to see at full view |
| Strike (`ink` strike) | an old value replaced by a new one | — |
| Fast-forward (`fastForward`) | long typing or a repeated action the viewer should see happen | a wait: cut it (`offCamera`) |
| Chapters (`chapter` lines) | over a minute, with sections | under a minute |
| Cover card (`intro({ cover })`) | a guide or client video: the title and the credit as the first frame and poster | a short teaser |
| Preview and recap cards (`card`) | a tutorial over a minute: list the steps, then show them again | a short tour or a launch teaser |
| Scenes (`flow`, `terminal`, `code`) | a concept with no UI: how data moves, an install step, a config | the app can show it |
| Context menu, drag, text select, keys | the task uses them | — |
| Second cursor (`ghost`) | the feature is shared editing | one person uses the feature |
| Framed background (`FRAME=1`) | a marketing page or social post | docs, where the video sits in the page |
| Burned-in captions | the user asks: autoplay muted, social, viewers in a second language | by default: they covered the UI the lines were about |
| Motion blur, music | the user asks for them | by default |

## 3. Write the script, one action per line

`narration.json` is a list of `{ id, label, text }` in playing order. `label` is a callout's
two-or-three-word name for the part (shown only by `t.say`); `speak` respells what the voice
says wrong; `card` is on-screen text when it should differ from the voice; `chapter` starts a
chapter at that line; `speed` (default 1) slows or quickens one line.

Keep the video's work (tour, narration, frames, audio, video) in a folder outside the repo
and outside `/tmp` or a session scratchpad: a restart empties those, and one took a finished
video's tour, narration and scripts with it. Something like `~/Videos/<project>-video`, with
the tour and narration also kept where the team can find them (section 7).

- One line names one thing the viewer sees happen. If a line covers two actions
  ("paste your file, or link a sheet"), split it, or the picture runs ahead of the voice.
- A line names only what the picture will show. A control that appears on hover, a list
  that loads late or a menu that closes before its name is said has to be on screen when
  the word is spoken (section 4), or the line changes.
- 6–16 words. Plain words, concrete nouns, no marketing adjectives. A closing line says
  what to do next in plain words ("Try it on your own pages"), not a stock call to action.
- Check names and acronyms: Kokoro runs letters together ("TQQQ" → "tikyukyukyu") and can
  stress a name wrongly. Fix it in `speak` with spaced letters ("T Q Q Q") or a phoneme
  override (`[Kokoro](/kˈOkəɹO/)`); `playbook.md` shows how to check pronunciation.

Then `node <skill>/voice.cjs <dir>`, or `node <skill>/voice-elevenlabs.cjs <dir>`. Both fail
loudly if a clip's length doesn't fit its words; check that clip's word timings for missing
words before going on. An ElevenLabs read that comes out rushed gets a new take with
`REVOICE=<id>`.

## 4. Write the tour, one segment per line

Copy `templates/tour.cjs`. Each `t.segment(id, run)` is one narration line; the segment
lasts until its line has been spoken, counted from the `t.speak()` or `t.say()` that starts it.

The rules that make it watchable (each came from a review):

- **The voice starts with the video.** `intro({ voiceFirst: true, typeAtWord, zoomAtWord })`
  types the address under the first line instead of in silence. A `cover` card, when the
  video has one, holds 2.6 s before it and opens onto the browser window.
- **Actions land on their words.** `await t.untilWord(id, 'Save')` before the click; the
  word times are the voice's own. A glide or camera move before it starts early by its own
  length, so it arrives as the word is said: `untilWord(id, 'Save', 0.6)`, then a 600 ms glide.
- **What the line names is visible when it is named.** A control that shows on hover (a
  section's toolbar, an embed's remove button) needs the cursor on its container first;
  wait until it is shown, then spot or zoom on it. A disabled first item (the up arrow of
  the first section) makes a poor example: use the second.
- **Callouts never cover what the cursor uses.** When the user asked for callouts, pass
  those selectors as `avoid`.
- **Show a screen before acting on it.** A library or list gets a second or two of a
  glide over its items before the click.
- **Cut waits, don't film them.** Loading goes in `t.offCamera()`, long typing in
  `t.fastForward()`; both sit between spoken lines, never inside one.
- **Take the network out of the timing.** Answer repeated reads (a media library and its
  thumbnails) from the first response in `prepare`, so a slow load in one take does not push
  an action past its word.
- **Wait on the app, not the clock.** In slow motion the app's own updates lag; before keys
  that depend on one (focus, a selection, an open menu), wait for it with
  `page.waitForFunction`. A fixed pause passes the dry run and fails the take.
- **Native `<select>` popups and context menus never show in screenshots**: use
  `t.pickOption()` and `t.contextMenu()`. A native date input is filled with `page.fill`
  after the click.
- **A mocked third-party screen** (an AI chat) is labelled generically and is not made
  to look like a real company's product.
- **No click sounds.** The build has none; don't add them.
- **State the app starts in is checked, not assumed.** Before a toggle, assert it is in
  the state the line describes; after an action the line reports, assert it happened.
- **For the PDF guide**, take a step's still with `t.still()` at the moment of its action,
  while the menu or dialog the line names is open.

## 5. Dry run, then record

```bash
NODE_PATH="$(npm root -g)" node tour.cjs <dir> dry     # a still per segment in <dir>/dry/
NODE_PATH="$(npm root -g)" node tour.cjs <dir> rec     # frames + timeline.json
CAPTIONS=off POSTER_AT=1 node <skill>/build.cjs <dir>  # POSTER_AT=1: the cover card is the poster
node <skill>/verify.cjs <dir>
NODE_PATH="$(npm root -g)" node <skill>/review.cjs <dir>
```

Look at every dry still before recording: spotlight fit, the camera's framing, the right
state on screen. `STOP_AFTER=<id>` ends a take early to check one part. A take records at
half speed (about 2.5x the video's length in real time) and writes about 13 MB of PNG
frames per second of video. The kit refuses to write into a full `frames/`, so move the old
one aside (`mv frames frames-take1`) before the next take.

## 6. Check before handing it over

`verify.cjs` must show every gap at 0.25 s or more and no unexplained long silence (a
cover card's 3–4 s before the first line is expected).

Then open every sheet `review.cjs` wrote. Each line has four stills, labelled with the word
being said: what the line names must be on screen, visible and in the state the line says,
at the moment it is named. Fix each line that fails (the tour, or the line itself) and take
again. After a new take, `review.cjs <dir> <dir>/review-2 --against <dir>/review` lists the
stills that changed and tiles them in `changed.png`; look at every one, since a take can
differ from the last (a slower load, a moved spot) where the tour did not change.

Then give the user each file as its full absolute path (a clickable link to the file, not a
folder followed by file names), with its length and size, and ask them to listen: you cannot
hear it, so pronunciation and pacing are theirs to judge. Name any rough spot.

When the user asks for a change: a script change means voicing again (only changed lines
are voiced), then a new take; a visual change needs only a new take and build.

## 7. Outputs

`build.cjs` writes `video.mp4` (H.264, crf 28, 2.5–4 MB a minute) with chapters inside,
and beside it `captions.vtt`, `chapters.vtt` and `youtube-chapters.txt` (when lines have
chapters), `transcript.md`, `poster.jpg` and `embed.html`. Options, by environment variable:
`CAPTIONS=off` (the command in section 5; captions burn in when it is left out), `FRAME=1`,
`MOTION_BLUR=1`, `MUSIC=<file>` (its licence is the user's to check), `TITLE`, `POSTER_AT`,
`BASE_URL` (adds `video.jsonld`), `AV1=1` (17% smaller, ~10 minutes of encoding: offer it,
don't default to it). Offer the outputs that fit where the video will play.

- **Cover, closing card and credit**: copy `templates/brand.json` and its logo into the video
  folder, or write the producer's own. `loadCredit(brandFile).creditHtml()` from `credit.cjs`
  goes in `intro({ cover: { kicker, title, subtitle, corner } })` and in the closing
  `t.card({ ..., corner })`: small print in the bottom-right corner, logo first, then the
  producer and version, the build date, the website and the tagline. It stays small so the
  title and the app keep the attention.
- **PDF guide**, to send or print: after a dry run, `guide-pdf.cjs <dir>` writes `guide.pdf`.
  `guide.json` (from `templates/`) gives the cover and one sentence per step. Rules from
  client review: each sentence is a full sentence written to be read and followed ("Click
  Save, and the status reads …"), not the narration line and not a label; each still is taken
  at the moment of its action with the menu or dialog open (`t.still()`) and the spotlight on
  the control; every step is finished on screen (the item picked, Done pressed, the save and
  its confirmation shown); the address is the real site's. With a `brand.json`, the credit sits
  in the bottom-right corner of the cover and of a back page.
- **Docs**: `guide.cjs` turns the dry run into `guide.md` and `walkthrough.html` for readers
  who would rather click or read than watch.
- **Re-shooting after a UI change**: keep `tour.cjs` and `narration.json` where the team
  can find them (the project's repo if the team wants that; frames, audio and video stay
  out). Approve a dry run's stills with `diff-stills.cjs <dir> --approve`; after the UI
  changes, a new dry run and `diff-stills.cjs <dir>` list the segments to fix.
