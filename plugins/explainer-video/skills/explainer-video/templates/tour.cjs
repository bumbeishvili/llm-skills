// A project's tour: copy into the video folder (a durable one, outside the repo and outside any
// temp folder), set APP_URL and the selectors, then one segment per narration line, in narration
// order. It uses the common pieces only; playbook.md has the rest, and SKILL.md says when each
// one helps.
//   node <skill>/voice.cjs <videoDir>              or voice-elevenlabs.cjs, when the user chose ElevenLabs
//   NODE_PATH="$(npm root -g)" node tour.cjs <videoDir> dry     look at <videoDir>/dry/*.png
//   NODE_PATH="$(npm root -g)" node tour.cjs <videoDir> rec
//   CAPTIONS=off POSTER_AT=1 node <skill>/build.cjs <videoDir> && node <skill>/verify.cjs <videoDir>
//   NODE_PATH="$(npm root -g)" node <skill>/review.cjs <videoDir>    then read every sheet
const fs = require('fs');
const path = require('path');
const SKILL = process.env.EXPLAINER_VIDEO_SKILL || path.join(__dirname, '..');
const { record } = require(path.join(SKILL, 'tour-kit.cjs'));
const { loadCredit } = require(path.join(SKILL, 'credit.cjs'));

const DIR = process.argv[2];
const APP_URL = 'http://localhost:5173/';           // the running app; never a production account
const ADDRESS = 'example.com';                      // what the intro types into the address bar
// The producer's credit on the cover and closing cards: copy templates/brand.json and its logo
// into the video folder (or write your own). Without a brand.json the cards carry no credit.
const BRAND_FILE = path.join(DIR, 'brand.json');
const CREDIT = fs.existsSync(BRAND_FILE) ? loadCredit(BRAND_FILE).creditHtml() : '';

record({
  dir: DIR,
  url: APP_URL,
  mode: process.argv[3] || 'dry',
  // A callout shows only a line's label, and only where a segment calls t.say. Lines started
  // with t.speak, and the intro's line (it has no label), put nothing over the page.
  callouts: 'label',
  // Before the first page: a demo login, made-up data served by route, settings in storage.
  // Never film a real account or real people's data.
  prepare: async (context) => {
    // await context.addCookies([...]);                          // a demo session
    // await context.route('**/api/items', r => r.fulfill({ json: DEMO_ITEMS }));
  },
  // Until the app is ready to film: data loaded, spinners gone, fonts in.
  ready: async (page) => {
    await page.waitForSelector('main');
    await page.evaluate(() => document.fonts.ready);
  },
  tour: async (t) => {
    // The opening: a cover card is the first frame (and, with POSTER_AT=1, the poster). It opens
    // onto the browser window; the voice starts, the address is typed on "portal" and the page
    // zooms to full screen on "every", about 2.4 s later (the page has to load first).
    await t.intro({
      id: 'welcome', address: ADDRESS, voiceFirst: true, typeAtWord: 'portal', zoomAtWord: 'every',
      cover: { kicker: 'Guide', title: 'Your product', subtitle: 'A step-by-step guide', corner: CREDIT },
    });

    // A click timed to the word that names it. The spotlight shows where; the move starts early by
    // its own length (0.6 s for a 600 ms glide), so the cursor arrives as the word is said.
    await t.segment('create', async () => {
      await t.spot(['#new-page-button'], 6);
      await t.speak('create');
      await t.untilWord('create', 'New', 0.6);
      await t.glideTo('#new-page-button', 600);
      await t.click();
    });

    // Typing, and a native <select> picked through the overlay menu. t.still() takes this step's
    // picture for the guides now, while the field it names is in use.
    await t.segment('fill', async () => {
      await t.spot(['form'], 6);
      await t.speak('fill');
      await t.typeInto('input[name="title"]', 'Spring opening hours');
      await t.untilWord('fill', 'status');
      await t.pickOption('select[name="status"]', 'draft');
      await t.still();
    });

    // A wait the viewer should not sit through (saving, a list loading) is cut out.
    // Keep it outside any spoken line: build.cjs refuses a cut under speech.
    await t.segment('save', async () => {
      await t.spotOff();
      await t.clickOn('button[type="submit"]', 600);
      await t.offCamera(() => t.page.waitForSelector('.toast-saved'));
      await t.spot(['.toast-saved'], 6);
      await t.speak('save');
    });

    // The closing card, with the voice over it and the credit in its corner.
    await t.segment('outro', async () => {
      await t.spotOff();
      await t.card({ title: 'Your product', subtitle: ADDRESS, corner: CREDIT });
      await t.pause(300);
      await t.speak('outro');
      await t.pause(1200);
    });
  },
}).catch((e) => { console.error(e); process.exit(1); });
