// The guide as an A4 PDF to keep, print or send: a cover, then one sentence and one still per
// step, each chapter on a new page, and a back page with the producer's credit. Built from a dry
// run (dry/steps.json and its stills); take a step's still at the moment of its action with
// t.still() in the tour, so a menu or dialog the line names is open in the picture.
//
// Optional files beside the video:
//  - guide.json: the cover and the sentences. The narration is written to be heard; a step's
//    sentence is written to be read and followed ("Click Save, and the status reads ...").
//      { "kicker", "title", "subtitle", "address", "url", "note",
//        "skip": ["outro"], "steps": { "<line id>": "One full sentence." } }
//    With `steps`, every dry step needs a sentence or a place in `skip`. "{address}" in a sentence
//    becomes a link to `url`.
//  - brand.json: the credit in the bottom-right corner of the cover and the back page (credit.cjs).
//
// Usage: NODE_PATH="$(npm root -g)" node guide-pdf.cjs <videoDir>     writes guide.pdf
const { chromium } = require('playwright');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const paths = require('./paths.cjs');
const { loadCredit } = require('./credit.cjs');

const DIR = process.argv[2];
if (!DIR) throw new Error('Usage: node guide-pdf.cjs <videoDir>');
const stepsFile = path.join(DIR, 'dry', 'steps.json');
if (!fs.existsSync(stepsFile)) throw new Error(`No ${stepsFile}: run the tour in dry mode first`);
const IMAGE_WIDTH = 1600, JPEG_QUALITY = 3;   // sharp in print at A4 width; ffmpeg's -q:v, 2 (best) to 31
const INK = '#1c1c1e';

const read = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
const guide = read(path.join(DIR, 'guide.json'), {});
const brandFile = path.join(DIR, 'brand.json');
const credit = fs.existsSync(brandFile) ? loadCredit(brandFile).creditHtml(INK) : '';
const skip = new Set(guide.skip || []);
const allSteps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
const steps = allSteps.filter((step) => !skip.has(step.id));

if (guide.steps) {
  const missing = steps.filter((step) => !guide.steps[step.id]).map((step) => step.id);
  if (missing.length) throw new Error(`guide.json has no sentence for: ${missing.join(', ')} (write one, or list the step in "skip")`);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const title = guide.title || process.env.TITLE || (allSteps.find((s) => s.chapter) || {}).chapter || 'Guide';
const addressLink = guide.address ? (guide.url ? `<a href="${esc(guide.url)}">${esc(guide.address)}</a>` : esc(guide.address)) : '';
const sentence = (step) => esc(guide.steps ? guide.steps[step.id] : step.text).replace('{address}', addressLink);

const imageDir = path.join(DIR, 'guide-img');
fs.mkdirSync(imageDir, { recursive: true });
const jpeg = (still) => {
  const out = path.join(imageDir, still.replace(/\.png$/, '.jpg'));
  const r = spawnSync(paths.ffmpeg(), ['-v', 'error', '-y', '-i', path.join(DIR, 'dry', still), '-vf', `scale='min(${IMAGE_WIDTH},iw)':-2`, '-q:v', String(JPEG_QUALITY), out]);
  if (r.status !== 0) throw new Error(`Could not convert ${still}: ${r.stderr}`);
  return 'file://' + path.resolve(out);
};

// Steps grouped by chapter. A line names its chapter only where the chapter starts, so each
// step belongs to the last chapter named before it.
const chapters = steps.reduce((list, step) => {
  if (!list.length || (step.chapter && step.chapter !== list[list.length - 1].title)) list.push({ title: step.chapter, steps: [] });
  list[list.length - 1].steps.push(step);
  return list;
}, []);

const body = chapters.map((chapter, c) => `
  <section class="chapter">
    ${chapter.title ? `<h2><span class="num">${c + 1}</span>${esc(chapter.title)}</h2>` : ''}
    ${chapter.steps.map((step, s) => `
    <figure class="step">
      <figcaption><span class="num">${c + 1}.${s + 1}</span><span>${sentence(step)}</span></figcaption>
      <img src="${jpeg(step.still)}" alt="">
    </figure>`).join('')}
  </section>`).join('');

const corner = credit ? `<div class="corner">${credit}</div>` : '';
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 16mm 15mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10.5pt/1.45 -apple-system, 'Helvetica Neue', Arial, sans-serif; color: ${INK}; }
  a { color: #2f6fdc; }
  .cover, .back { position: relative; height: 255mm; }
  .cover { display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 40mm; break-after: page; }
  .back { break-before: page; }
  .cover .kicker { font-size: 10pt; letter-spacing: .08em; text-transform: uppercase; color: #2f6fdc; margin-bottom: 6mm; }
  .cover h1 { font: 400 34pt/1.1 Georgia, 'Times New Roman', serif; margin: 0 0 6mm; }
  .cover p { margin: 0; font-size: 12pt; color: #555; }
  .cover .address { margin-top: 10mm; font-size: 12pt; }
  .cover .note { margin-top: 3mm; font-size: 9pt; color: #777; }
  .corner { position: absolute; right: 0; bottom: 0; }
  .credit { display: flex; flex-direction: column; align-items: flex-end; font-size: 7.5pt; line-height: 1.5; color: #7a7a80; }
  .credit img { height: 4mm; margin-bottom: 2mm; }
  .credit a { color: inherit; text-decoration: none; }
  .credit sup { font-size: .7em; line-height: 0; }
  .chapter { break-before: page; }
  h2 { font: 400 20pt/1.2 Georgia, 'Times New Roman', serif; margin: 0 0 6mm; display: flex; gap: 4mm; align-items: baseline; }
  h2 .num { font: 600 11pt -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #2f6fdc; }
  .step { margin: 0 0 9mm; break-inside: avoid; }
  .step figcaption { display: flex; gap: 3mm; margin-bottom: 3mm; font-size: 11pt; }
  .step figcaption .num { flex: none; min-width: 9mm; font-weight: 600; color: #2f6fdc; }
  .step img { display: block; max-width: 100%; max-height: 105mm; border: 0.3mm solid #d9dce6; border-radius: 2mm; }
</style></head>
<body>
  <section class="cover">
    ${guide.kicker ? `<div class="kicker">${esc(guide.kicker)}</div>` : ''}
    <h1>${esc(title)}</h1>
    ${guide.subtitle ? `<p>${esc(guide.subtitle)}</p>` : ''}
    ${addressLink ? `<div class="address">${addressLink}</div>` : ''}
    ${guide.note ? `<div class="note">${esc(guide.note)}</div>` : ''}
    ${corner}
  </section>
  ${body}
  ${credit ? `<section class="back">${corner}</section>` : ''}
</body></html>`;

(async () => {
  const htmlFile = path.join(DIR, 'guide-pdf.html');
  fs.writeFileSync(htmlFile, html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(htmlFile), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(DIR, 'guide.pdf');
  await page.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font:8px Helvetica,Arial,sans-serif;color:#888;padding:0 15mm;display:flex;justify-content:space-between"><span>${esc(title)}</span><span class="pageNumber"></span></div>`,
  });
  await browser.close();
  console.log(`${out}: ${steps.length} steps in ${chapters.length} chapters, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
})();
