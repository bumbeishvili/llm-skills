// Sweeps a running app for its data-debug explanations: opens every address given, at a desktop and a phone window,
// collects each `data-calc` the pages carry, and reports page errors and explanations whose text is broken or
// shortened. A flag is a prompt to read that card; the explanations themselves are checked by reading the out file.
//
// Usage: node check-explanations.cjs <origin> <addresses.txt> [out.txt] [--flag <regex>]... [--block <regex>]...
//   <origin>         where the app runs, with its base path: http://localhost:5173
//   <addresses.txt>  one address a line, one for every state that changes a figure (each route, view, filter value,
//                    selected item, open table), written as the address reaches it: /prices?view=ranked&region=north
//                    Lines starting with # are skipped.
//   [out.txt]        every distinct explanation with the address it was first found at (default: explanations.txt)
//   --flag <regex>   a stand-in this project's explanations must not fall back to, e.g. "\ba reason\b"
//   --block <regex>  requests to abort, for a third-party widget that keeps the network busy
//
// Needs Playwright where Node can resolve it: run it from a copy inside the project.
const fs = require('fs');
const { chromium } = require('playwright');

const VIEWPORTS = [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 }
];
// How long a page gets after its network settles, for charts to draw and tag themselves.
const SETTLE = 250;
// Text an explanation shows when it was built wrong, or when it leaves the reader to fill something in.
const FLAGS = [
	{ name: 'a value that did not format', test: (text) => /undefined|NaN|Infinity|\[object|\bnull\b|\bfalse\b/.test(text) },
	{ name: 'shortened text', test: (text) => /…|\.\.\.|\betc\b/.test(text) },
	{ name: 'a column name without its closing backtick', test: (text) => text.split('\n').some((line) => line.split('`').length % 2 === 0) },
	{ name: 'an empty line, or "=" with nothing on one side', test: (text) => text.split('\n').some((line) => /^\s*$|^\s*=|=\s*$/.test(line)) },
	{ name: 'a line the convention leaves out', test: (text) => /^(rows?|why|notes?|glossary)\s*[:=]/im.test(text) }
];

function readArguments(values) {
	const options = { flag: [], block: [] };
	const positional = [];
	for (let index = 0; index < values.length; index += 1) {
		const name = values[index].startsWith('--') ? values[index].slice(2) : null;
		if (name === null) positional.push(values[index]);
		else if (options[name]) options[name].push(new RegExp(values[(index += 1)], 'i'));
		else throw new Error(`Unknown option --${name}`);
	}
	const [origin, addressFile, outFile = 'explanations.txt'] = positional;
	if (!origin || !addressFile) throw new Error('Usage: node check-explanations.cjs <origin> <addresses.txt> [out.txt] [--flag <regex>]... [--block <regex>]...');
	return { origin: origin.replace(/\/$/, ''), addressFile, outFile, ...options };
}

(async () => {
	const { origin, addressFile, outFile, flag, block } = readArguments(process.argv.slice(2));
	const addresses = fs
		.readFileSync(addressFile, 'utf8')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith('#'));
	const flags = [...FLAGS, ...flag.map((pattern) => ({ name: `the stand-in ${pattern}`, test: (text) => pattern.test(text) }))];

	const browser = await chromium.launch();
	// Each distinct explanation with where it was first found; the addresses that carry none; the pages' errors.
	const found = new Map();
	const empty = [];
	const errors = [];
	for (const viewport of VIEWPORTS) {
		const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
		await Promise.all(block.map((pattern) => context.route(pattern, (route) => route.abort())));
		const page = await context.newPage();
		page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
		// A failed request logs "Failed to load resource" without its address, so failed requests are read from the
		// request itself, and only the app's own count.
		page.on('console', (message) => message.type() === 'error' && !message.text().startsWith('Failed to load resource') && errors.push(`${page.url()}: ${message.text()}`));
		page.on('requestfailed', (request) => request.url().startsWith(origin) && errors.push(`${page.url()}: request failed ${request.url()}`));
		for (const address of addresses) {
			await page.goto(`${origin}${address}`, { waitUntil: 'networkidle' });
			await page.waitForTimeout(SETTLE);
			const explained = await page.$$eval('[data-calc]', (elements) =>
				elements.map((element) => ({ note: element.getAttribute('data-calc-note'), calc: element.getAttribute('data-calc') }))
			);
			if (explained.length === 0) empty.push(`${viewport.width}px ${address}`);
			for (const { note, calc } of explained) {
				const text = `${note ?? '(no title)'}\n${calc}`;
				if (!found.has(text)) found.set(text, `${viewport.width}px ${address}`);
			}
		}
		await context.close();
	}
	await browser.close();

	const entries = [...found.entries()];
	fs.writeFileSync(outFile, entries.map(([text, where]) => `### ${where}\n${text}\n`).join('\n'));
	const flagged = entries
		.map(([text, where]) => ({ text, where, reasons: flags.filter(({ test }) => test(text)).map(({ name }) => name) }))
		.filter(({ reasons }) => reasons.length > 0);
	const longest = entries.reduce((most, [text]) => Math.max(most, text.split('\n').length), 0);

	console.log(`${addresses.length} addresses at ${VIEWPORTS.length} window sizes, ${entries.length} distinct explanations, longest ${longest} lines, written to ${outFile}`);
	console.log(`addresses with no explanation: ${empty.length}`);
	empty.map((where) => console.log(`  ${where}`));
	console.log(`page errors: ${errors.length}`);
	errors.map((error) => console.log(`  ${error}`));
	console.log(`flagged explanations: ${flagged.length}`);
	flagged.map(({ text, where, reasons }) => console.log(`--- ${where} | ${reasons.join('; ')}\n${text}`));
	process.exitCode = errors.length > 0 || flagged.length > 0 ? 1 : 0;
})();
