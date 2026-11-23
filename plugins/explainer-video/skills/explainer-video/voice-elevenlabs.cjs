// Voices narration.json with ElevenLabs, a cloud voice, in place of voice.cjs (Kokoro, on this
// machine). It writes the same fields as voice.cjs (file, dur, word timings), so tour-kit.cjs and
// build.cjs work unchanged. The script's text is sent to ElevenLabs, so use it only when the user
// has chosen it.
//
// Word timings come from the API's character alignment. Each clip is trimmed at -45 dB, as
// Kokoro's are. The cache keeps what the API returned (the audio and each word's time), so the
// trim runs on every call and changing it needs no new requests. Only lines whose text, voice or
// settings changed are requested again.
//
// Usage: node voice-elevenlabs.cjs <videoDir>
//   ELEVENLABS_API_KEY    required; a key limited to text to speech is enough
//   ELEVENLABS_VOICE_ID   the voice (default: Matilda, a calm American narration voice)
//   ELEVENLABS_MODEL      default eleven_multilingual_v2, which keeps one voice steady across separately voiced lines
//   ELEVENLABS_FORMAT     default mp3_44100_128, which every plan allows; mp3_ and pcm_ formats both work
//   REVOICE=<id>,<id>     request these lines again (a rushed or odd read)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const paths = require('./paths.cjs');

const DIR = process.argv[2];
if (!DIR) throw new Error('Usage: node voice-elevenlabs.cjs <videoDir>');
const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) throw new Error('ELEVENLABS_API_KEY is not set');

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'XrExE9yKIg1WjnnlVkGX';
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const FORMAT = process.env.ELEVENLABS_FORMAT || 'mp3_44100_128';
const SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true };
const REVOICE = new Set((process.env.REVOICE || '').split(',').filter(Boolean));

const SAMPLE_RATE = Number(FORMAT.split('_')[1]);
if (!SAMPLE_RATE) throw new Error(`ELEVENLABS_FORMAT "${FORMAT}" names no sample rate (expected e.g. mp3_44100_128 or pcm_24000)`);
const IS_PCM = FORMAT.startsWith('pcm_');
const THRESHOLD = 10 ** (-45 / 20);       // -45 dB trim level, as in kokoro_words.py
const WINDOW = Math.round(0.02 * SAMPLE_RATE);
const CLICK_WINDOWS = 3;                  // a sound under 60 ms...
const CLICK_GAP_WINDOWS = 12;             // ...set 240 ms apart from the speech is a click, not a word
const SECONDS_PER_WORD = [0.2, 0.75];     // outside this range, the read was rushed or words went missing

const narrationFile = path.join(DIR, 'narration.json');
const lines = JSON.parse(fs.readFileSync(narrationFile, 'utf8'));
const ids = new Set();
lines.map((line) => {
  if (!line.id || !line.text) throw new Error(`Every narration line needs an id and a text: ${JSON.stringify(line)}`);
  if (ids.has(line.id)) throw new Error(`Duplicate narration id "${line.id}"`);
  ids.add(line.id);
});
const unknown = [...REVOICE].filter((id) => !ids.has(id));
if (unknown.length) throw new Error(`REVOICE names lines that are not in narration.json: ${unknown.join(', ')}`);
// What the voice reads: `speak` respells what it says wrong; the screen shows `text`.
const spoken = (line) => line.speak || line.text;
const settingsOf = (line) => ({ ...SETTINGS, speed: line.speed || 1 });

const cacheDir = path.join(DIR, 'audio', 'cache');
fs.mkdirSync(cacheDir, { recursive: true });
const keyOf = (line) => crypto.createHash('sha1')
  .update(JSON.stringify([spoken(line), VOICE_ID, MODEL, settingsOf(line), FORMAT])).digest('hex').slice(0, 16);
const cached = (line) => path.join(cacheDir, `el-${keyOf(line)}`);
const audioFile = (line) => cached(line) + (IS_PCM ? '.pcm' : '.mp3');

// The neighbouring lines go along as context, so each clip's intonation fits the lines around it.
const synthesize = async (line, index) => {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      text: spoken(line),
      model_id: MODEL,
      voice_settings: settingsOf(line),
      previous_text: index > 0 ? spoken(lines[index - 1]) : undefined,
      next_text: index + 1 < lines.length ? spoken(lines[index + 1]) : undefined,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`ElevenLabs refused ${line.id} (${response.status}): ${JSON.stringify(body.detail)}`);
  return body;
};

// One entry per word of the text, timed from its first to its last letter or digit.
// Tokens without any (a lone dash) are skipped, as Kokoro skips them.
const wordsOf = (text, alignment) => {
  if (alignment.characters.join('') !== text) throw new Error(`The alignment does not match the text "${text}"`);
  const isWordChar = (ch) => /[A-Za-z0-9]/.test(ch);
  return [...text.matchAll(/\S+/g)].filter(m => [...m[0]].some(isWordChar)).map((m) => {
    const chars = [...m[0]];
    return {
      text: m[0].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''),
      start: alignment.character_start_times_seconds[m.index + chars.findIndex(isWordChar)],
      end: alignment.character_end_times_seconds[m.index + chars.findLastIndex(isWordChar)],
    };
  });
};

const request = async (line, index) => {
  const { audio_base64, alignment } = await synthesize(line, index);
  fs.writeFileSync(audioFile(line), Buffer.from(audio_base64, 'base64'));
  fs.writeFileSync(cached(line) + '.json', JSON.stringify({ words: wordsOf(spoken(line), alignment) }));
};

// 16-bit mono samples: PCM formats are raw already, MP3 goes through ffmpeg.
const samplesOf = (file) => {
  if (IS_PCM) {
    const raw = fs.readFileSync(file);
    return new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
  }
  const r = spawnSync(paths.ffmpeg(), ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(SAMPLE_RATE), '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr}`);
  return new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 2);
};

// Runs of 20 ms windows whose RMS clears -45 dB, as [first, last] window indexes.
const loudRuns = (samples) => {
  const count = Math.floor(samples.length / WINDOW);
  const loud = Array.from({ length: count }, (_, w) => {
    const window = samples.subarray(w * WINDOW, (w + 1) * WINDOW);
    return Math.sqrt(window.reduce((sum, s) => sum + (s / 32768) ** 2, 0) / WINDOW) > THRESHOLD;
  });
  return loud.reduce((runs, isLoud, w) => {
    if (!isLoud) return runs;
    const previous = runs[runs.length - 1];
    if (previous && previous[1] === w - 1) previous[1] = w;
    else runs.push([w, w]);
    return runs;
  }, []);
};

// The speech's first and last sample. A clip can end on a short click after a silence;
// trimming at the click would leave that silence in the clip, so the click is dropped.
const speechBounds = (samples) => {
  const runs = loudRuns(samples);
  if (!runs.length) throw new Error('the clip is silent');
  const gap = (a, b) => Math.max(a[0], b[0]) - Math.min(a[1], b[1]) - 1;
  const isClick = (run, neighbour) => run[1] - run[0] + 1 < CLICK_WINDOWS && gap(run, neighbour) >= CLICK_GAP_WINDOWS;
  while (runs.length > 1 && isClick(runs[0], runs[1])) runs.shift();
  while (runs.length > 1 && isClick(runs[runs.length - 1], runs[runs.length - 2])) runs.pop();
  return [runs[0][0] * WINDOW, (runs[runs.length - 1][1] + 1) * WINDOW];
};

const writeWav = (file, samples) => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples.byteLength, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples.byteLength, 40);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]));
};

// Writes audio/<id>.wav trimmed to the speech, with word times counted from the trimmed start.
const trim = (line) => {
  const samples = samplesOf(audioFile(line));
  const [first, last] = speechBounds(samples);
  const lead = first / SAMPLE_RATE;
  const fromStart = (seconds) => Math.round(Math.max(0, seconds - lead) * 1000) / 1000;
  const file = path.join(DIR, 'audio', `${line.id}.wav`);
  writeWav(file, samples.subarray(first, last));
  const { words } = JSON.parse(fs.readFileSync(cached(line) + '.json', 'utf8'));
  return {
    file,
    dur: Math.round((last - first) / SAMPLE_RATE * 1000) / 1000,
    words: words.map(w => ({ ...w, start: fromStart(w.start), end: fromStart(w.end) })),
  };
};

const main = async () => {
  const toVoice = lines.map((line, index) => ({ line, index }))
    .filter(({ line }) => REVOICE.has(line.id) || !fs.existsSync(audioFile(line)));
  // One request at a time keeps within every plan's concurrency limit.
  for (const { line, index } of toVoice) await request(line, index);
  console.log(`${toVoice.length} of ${lines.length} lines voiced, the rest unchanged`);

  lines.map((line) => {
    const { file, dur, words } = trim(line);
    const count = spoken(line).split(/\s+/).length;
    if (dur / count < SECONDS_PER_WORD[0] || dur / count > SECONDS_PER_WORD[1]) {
      throw new Error(`${line.id}: ${dur.toFixed(2)}s for ${count} words looks wrong. Check its word timings for missing words; a rushed read gets a new take with REVOICE=${line.id}. Listen to ${file}`);
    }
    Object.assign(line, { file: path.relative(DIR, file), dur, words, voicedText: spoken(line), voice: `elevenlabs:${VOICE_ID}`, model: MODEL });
    console.log(`${line.id.padEnd(16)} ${dur.toFixed(2)}s  ${words.map(w => `${w.text}@${w.start.toFixed(2)}`).join(' ')}`);
  });
  fs.writeFileSync(narrationFile, JSON.stringify(lines, null, 1) + '\n');
  console.log(`${lines.length} lines, ${lines.reduce((sum, l) => sum + l.dur, 0).toFixed(1)}s of speech`);
};

main();
