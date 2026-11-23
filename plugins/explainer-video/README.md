# explainer-video

Narrated explainer and guide videos of a web app, voiced locally with Kokoro 82M or, when you choose it, with ElevenLabs. A PDF guide can go with the video.

## Install

```bash
npx degit bumbeishvili/claude-skills/plugins/explainer-video/skills/explainer-video .claude/skills/explainer-video
mkdir -p .agents/skills && ln -s ../../.claude/skills/explainer-video .agents/skills/explainer-video
```

The first line installs the skill for Claude Code, the second links it for Codex. Invoke with `/explainer-video` in Claude Code or `$explainer-video` in Codex, or ask for a tour, guide or demo video of an app.

The voice and tools, once per machine (Apple Silicon Mac, about 1.5 GB in `~/.cache/explainer-video`):

```bash
bash .claude/skills/explainer-video/setup.sh --check   # what is missing
bash .claude/skills/explainer-video/setup.sh           # install it, then voice a test line
```

That installs mlx-audio with the `mlx-community/Kokoro-82M-bf16` model (voice `af_heart`), an ffmpeg with H.264, and Playwright. The agent runs the check and asks you to run the install when something is missing.

For the ElevenLabs voice, set `ELEVENLABS_API_KEY` (a key limited to text to speech is enough). The script's text is then sent to ElevenLabs; the agent asks before using it.

## What it covers

`skills/explainer-video/SKILL.md` has the workflow: agree the video, choose the effects that suit it, write one narration line per action, voice it, write the tour from `templates/`, dry-run, record, build and verify. Its effects table says when each one helps and when to leave it out; a video uses a few of them, not all.

The kit films the real app with a cursor that clicks, types, drags and selects, and adds:

- a camera that zooms in, follows the cursor or drifts on a held shot
- a spotlight, a blur round one panel, and marks (circle, underline, highlighter, strike, arrows, notes, step badges) drawn on the word that names them; callouts on request
- chapters, a cover card, preview and recap cards, lower thirds, stat cards, a before/after wipe, fast-forward over long typing
- flowchart, terminal and code scenes for what the app cannot show
- the producer's credit (logo, version, build date, website, tagline) small in the corner of the cover and closing cards, from a `brand.json`; infogr8's is in `templates/`
- a voice that starts with the first frame, and captions in a `.vtt` file (burned in on request)

`build.cjs` writes the MP4 with chapters inside, plus captions and chapter files, a transcript, a poster and an embed page; options add a framed background, motion blur or a music bed. `review.cjs` puts each narration line beside four stills taken as its words are spoken, so every line can be checked against the picture, and lists the stills a new take changed. `guide.cjs` turns a dry run into a written guide and a click-through walkthrough, `guide-pdf.cjs` into an A4 PDF guide with a cover, a sentence and a screenshot per step, and the credit, and `diff-stills.cjs` lists the segments a UI change affects. `playbook.md` has every call, recipes, planning numbers and the traps behind each rule.

A two-minute video takes about 5 minutes to record and 1–3 to build, and comes out at 5–8 MB.

Part of [claude-skills](../../).
