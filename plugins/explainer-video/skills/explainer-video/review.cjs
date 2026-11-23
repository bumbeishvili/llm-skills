// Frame review of a built video: four stills per narration line, each labelled with the word
// being spoken at that moment, tiled three lines to a sheet. Every line is then checked against
// its picture: what the line names is on screen, visible, at the moment it is named.
//
// After a new take, `--against <older review dir>` lists the stills that changed since that
// review (structural similarity under 0.92) and tiles them into changed.png, so only those need
// a second look.
//
// Usage: NODE_PATH="$(npm root -g)" node review.cjs <videoDir> [outDir] [--against <dir>]
//   outDir defaults to <videoDir>/review; it reads video.mp4, cues.json and narration.json
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const paths = require('./paths.cjs');

const args = process.argv.slice(2);
const againstAt = args.indexOf('--against');
const against = againstAt >= 0 ? args.splice(againstAt, 2)[1] : null;
const [DIR, outArg] = args;
if (!DIR) throw new Error('Usage: node review.cjs <videoDir> [outDir] [--against <older review dir>]');
const OUT = outArg || path.join(DIR, 'review');
const FF = paths.ffmpeg();
const FRAMES_PER_LINE = 4;
const LINES_PER_SHEET = 3;
const CHANGED_BELOW = 0.92;   // structural similarity under this counts as a changed still
const STILL_WIDTH = 960;

const video = path.join(DIR, 'video.mp4');
const narration = JSON.parse(fs.readFileSync(path.join(DIR, 'narration.json'), 'utf8'));
const { says } = JSON.parse(fs.readFileSync(path.join(DIR, 'cues.json'), 'utf8'));

// The moments to look at: evenly spread words, each at its middle. A line voiced without word
// timings (another language) gets evenly spread moments instead.
const picksOf = (line, at) => line.words && line.words.length
  ? Array.from({ length: FRAMES_PER_LINE }, (_, i) => {
    const word = line.words[Math.round((i * (line.words.length - 1)) / (FRAMES_PER_LINE - 1))];
    return { word: word.text, at: at + (word.start + word.end) / 2 };
  })
  : Array.from({ length: FRAMES_PER_LINE }, (_, i) => ({ word: '', at: at + (line.dur * (i + 0.5)) / FRAMES_PER_LINE }));

const lines = says.map((say) => {
  const line = narration.find((entry) => entry.id === say.id);
  if (!line) throw new Error(`cues.json names "${say.id}", which is not in narration.json: build again after voicing`);
  return { id: say.id, text: line.text, picks: picksOf(line, say.at) };
});

fs.mkdirSync(OUT, { recursive: true });
const grab = (at, file) => {
  const r = spawnSync(FF, ['-loglevel', 'error', '-y', '-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-vf', `scale=${STILL_WIDTH}:-1`, file]);
  if (r.status !== 0) throw new Error(`ffmpeg could not take a still at ${at.toFixed(2)}s: ${r.stderr}`);
};
const dataUri = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
const stills = lines.map((line) => ({
  ...line,
  images: line.picks.map((pick, i) => {
    const file = path.join(OUT, `${line.id}-${i}.png`);
    grab(pick.at, file);
    return { ...pick, name: path.basename(file), file };
  }),
}));

// Structural similarity of two stills of the same size, 1 for identical.
const similarity = (a, b) => {
  const r = spawnSync(FF, ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-'], { encoding: 'utf8' });
  const found = r.stderr.match(/All:([0-9.]+)/);
  if (!found) throw new Error(`ffmpeg could not compare ${a} with ${b}: ${r.stderr.slice(-300)}`);
  return Number(found[1]);
};

const STYLE = '<style>body{margin:0;background:#222;width:1920px;font:15px sans-serif;color:#fff}h2{font-size:17px;margin:8px 6px 4px;color:#ffd166}'
  + '.row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}img{width:100%;display:block}figure{margin:0}figcaption{padding:2px 4px}</style>';
const figure = (src, caption) => `<figure><figcaption>${caption}</figcaption><img src="${src}"></figure>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 400 } });
  const shoot = async (html, file) => {
    await page.setContent(STYLE + html);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  };

  for (let i = 0; i < stills.length; i += LINES_PER_SHEET) {
    const rows = stills.slice(i, i + LINES_PER_SHEET).map((line) => `<h2>${line.id}: ${line.text}</h2><div class="row">`
      + line.images.map((img) => figure(dataUri(img.file), `${img.at.toFixed(1)} s "${img.word}"`)).join('') + '</div>');
    await shoot(rows.join(''), `sheet-${String(i / LINES_PER_SHEET + 1).padStart(2, '0')}.png`);
  }
  console.log(`${stills.length} lines, ${Math.ceil(stills.length / LINES_PER_SHEET)} sheets in ${OUT}`);

  if (against) {
    const changed = stills.flatMap((line) => line.images)
      .filter((img) => fs.existsSync(path.join(against, img.name)))
      .map((img) => ({ ...img, score: similarity(path.join(against, img.name), img.file) }))
      .filter((img) => img.score < CHANGED_BELOW)
      .sort((a, b) => a.score - b.score);
    changed.map((img) => console.log(`${img.score.toFixed(3)}  ${img.name}  "${img.word}"`));
    if (changed.length) await shoot(`<div class="row">${changed.map((img) => figure(dataUri(img.file), `${img.name} ${img.score.toFixed(2)}`)).join('')}</div>`, 'changed.png');
    console.log(`${changed.length} stills changed since ${against}${changed.length ? `; tiled in ${path.join(OUT, 'changed.png')}` : ''}`);
  }
  await browser.close();
})();
