// The producer's credit, small in a corner: on the video's cover and closing cards
// (`card({ corner })`, `intro({ cover: { corner } })`) and on the PDF guide's cover and back page.
// It reads a brand.json (templates/brand.json is infogr8's): a logo, then one line each for the
// producer and version, the date, the website and the tagline. The date is the day the video or
// guide is built, so it shows when this version was produced.
//
//   const { creditHtml } = loadCredit(path.join(dir, 'brand.json'));
//   creditHtml()            the logo in its own colour (a light logo, for the video's dark cards)
//   creditHtml('#1c1c1e')   the logo recoloured (a dark one, for print)
const fs = require('fs');
const path = require('path');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// A logo that takes its colour from a CSS variable with a fallback, as Figma exports it.
const LOGO_FILL = /var\(--fill-0, #[0-9A-Fa-f]{3,8}\)/;
const REQUIRED = ['producer', 'version', 'website', 'websiteLabel', 'tagline', 'logo'];

const loadCredit = (brandFile) => {
  const brand = JSON.parse(fs.readFileSync(brandFile, 'utf8'));
  const missing = REQUIRED.filter((key) => !brand[key]);
  if (missing.length) throw new Error(`${brandFile} is missing ${missing.join(', ')}`);
  const logoFile = path.resolve(path.dirname(brandFile), brand.logo);
  const producedOn = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // An <img> can't pass a CSS variable into an SVG, so another colour is written into a copy.
  const logoUri = (color) => {
    const svg = fs.readFileSync(logoFile, 'utf8');
    if (color && !LOGO_FILL.test(svg)) throw new Error(`${logoFile} has no var(--fill-0, ...) colour to replace`);
    const coloured = color ? svg.replace(LOGO_FILL, color) : svg;
    return `data:image/svg+xml;base64,${Buffer.from(coloured).toString('base64')}`;
  };

  // Webfonts often draw ™ and ® on the baseline, so they are raised explicitly.
  const creditHtml = (logoColor) => `<div class="credit">
  <img src="${logoUri(logoColor)}" alt="${esc(brand.producer)}">
  <span>Produced by ${esc(brand.producer)}. ${esc(brand.version)}</span>
  <span>Date: ${producedOn}</span>
  <a href="${esc(brand.website)}">${esc(brand.websiteLabel)}</a>
  <span>${esc(brand.tagline).replace(/[™®]/g, (mark) => `<sup>${mark}</sup>`)}</span>
</div>`;

  return { brand, producedOn, creditHtml };
};

module.exports = { loadCredit };
