/*
 * data-debug-overlay.js — framework-agnostic `data-calc` inspector.
 *
 * Add `#debug` to any URL and every element carrying a `data-calc` attribute gets a dashed outline and a "ƒx" badge.
 * Hover or tap a badge to see how the figure was worked out, as a card: `data-calc-note` as its title, the sheet most
 * of its columns come from, then `data-calc` a row a line, the line's term on the left and how it is worked out on
 * the right. Press Esc — or remove the hash — to exit.
 *
 * Drop-in:  <script src="data-debug-overlay.js"></script>   (auto-inits on load)
 * Manual:   const overlay = initDataDebugOverlay({ accent, modalSelector, sources, sheets, sheetWord });
 *           // ...later: overlay.destroy();
 *
 * While it is on, <html> carries `data-calc-debug`, and a `data-debug-change` event on window (`event.detail.on`)
 * tells each turn on and off, so a hover card can stay open for the badges of its figures.
 *
 * Zero dependencies. Reads only the DOM; writes only its own overlay layer and that one attribute.
 */
(function () {
	const DEFAULTS = {
		accent: '#5450f8',
		// While one of these is open only its marks show: badges of the page under it would read as part of it.
		modalSelector: '.fixed.inset-0.z-50, [aria-modal="true"], [role="dialog"], dialog[open]',
		// The source files the explanations name, as a list or as { key: file }, shown along the foot.
		sources: [],
		// What comes before the dot in the explanations' names (`sheet.column`): a workbook's sheets, or the files
		// without their extensions, spelled as the explanations spell them. With them a card names its main sheet once
		// and shows that sheet's columns alone; without them every name shows whole.
		sheets: [],
		// What one of those is called in the card's "Columns are from the … X" line: 'sheet', 'file', 'table'.
		sheetWord: 'sheet'
	};
	const HASH = '#debug';
	// What tells the page the overlay is on: an attribute on <html>, and an event on window at each change.
	const ON_ATTRIBUTE = 'data-calc-debug';
	const CHANGE_EVENT = 'data-debug-change';
	const HINT = 'Data debug: hover or tap a ƒx badge to see how it was worked out. Esc to exit.';
	const MORE_BY_MOUSE = 'More below: turn the mouse wheel over the ƒx badge';
	const MORE_BY_TOUCH = 'More below: drag to scroll, tap to close';
	// The outline's distance from its element, the badge's size, and the space between a badge and the outline it
	// follows.
	const OUTSET = 3;
	const BADGE = { width: 26, height: 22 };
	const BADGE_GAP = 2;
	// How far a badge may run onto the edge of a figure's text box without covering it.
	const TEXT_SLACK = 3;
	// The explanation's card keeps this far from the window's edges, and opens under its badge in the window's top part.
	const EDGE = 8;
	const OPEN_BELOW = 280;

	// A line is "term = how" or "term: how": the first of those marks, if it comes before the line's first name. A line
	// without one runs the card's width.
	const TERM_MARKS = [' = ', ': '];
	// Inside "how", each further " = " starts the next step of the calculation.
	const STEP_MARK = ' = ';
	// The arithmetic signs between values, set apart from the words around them.
	const SIGNS = /( ÷ | × | \+ | − )/;

	// The card's styles: a stylesheet inside the overlay's layer, since its two layouts depend on the window's width
	// and on whether the pointer hovers. The card is built from <div> and <span> alone, which a page's own rules for
	// <p>, <dl> or <code> leave untouched.
	const CARD_STYLES = `
		[data-calc-overlay] { --dc-ink: #1b1b1b; --dc-sign: #ffd166; }
		.dc-tip { position: absolute; z-index: 10; box-sizing: border-box; width: max-content;
			max-width: min(720px, calc(100vw - 16px)); max-height: calc(100dvh - 16px); overflow-y: auto;
			overscroll-behavior: contain; border-radius: 8px; border: 1px solid var(--dc-accent);
			background: var(--dc-ink); padding: 16px 20px; text-align: left; font-size: 14px; line-height: 1.5;
			color: #e3e8ff; box-shadow: 0 10px 30px rgba(0, 0, 0, .35); }
		.dc-note { font-size: 16px; font-weight: 600; color: #fff; }
		.dc-sheet { margin-top: 4px; font-size: 12px; color: rgba(255, 255, 255, .7); }
		/* A row a line: its term, then how it is worked out. A rule sets each row off from the one above. */
		.dc-rows { display: grid; grid-template-columns: minmax(0, max-content) minmax(0, 1fr); }
		.dc-rows.dc-titled { margin-top: 12px; }
		.dc-term, .dc-how { border-top: 1px solid rgba(255, 255, 255, .14); padding: 5px 0; }
		.dc-term { max-width: 16rem; padding-right: 20px; font-weight: 600; color: #fff; }
		.dc-wide { grid-column: 1 / -1; }
		/* A calculation's next steps, each under the one before, behind its "=". */
		.dc-step { margin-top: 2px; }
		.dc-equals, .dc-sign { margin: 0 8px; font-weight: 600; color: var(--dc-sign); }
		.dc-equals.dc-leads { margin-left: 0; }
		/* A name moves to the next line whole, and breaks only where it is longer than a line. */
		.dc-code { display: inline-block; max-width: 100%; border-radius: 4px; background: rgba(255, 255, 255, .1);
			padding: 0 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #fff; }
		.dc-sheet .dc-code { font-size: 12px; }
		.dc-other-sheet { color: rgba(255, 255, 255, .6); }
		/* How to scroll a card that holds more than it shows, kept at its foot. */
		.dc-more { position: sticky; bottom: -16px; margin: 0 -20px -16px; border-top: 1px solid rgba(255, 255, 255, .14);
			background: var(--dc-ink); padding: 8px 20px; font-size: 12px; color: var(--dc-sign); }
		.dc-by-touch { display: none; }
		/* Touch screens: the card takes the finger, so a card taller than the window can be scrolled. */
		@media (hover: none) {
			.dc-tip { pointer-events: auto; }
			.dc-by-mouse { display: none; }
			.dc-by-touch { display: inline; }
		}
		/* A narrow window: the term over how it is worked out, the rule above the term alone. */
		@media (max-width: 640px) {
			.dc-rows { grid-template-columns: minmax(0, 1fr); }
			.dc-term { max-width: none; padding-bottom: 0; }
			.dc-term + .dc-how { border-top: 0; padding-top: 2px; }
		}
	`;

	// The page's overlay: a call with options replaces the one made on load.
	let current = null;

	const px = (value) => `${value}px`;

	// A new element with its styles inline, so the marks need no stylesheet, and its text where it has one.
	function create(tag, styles, text) {
		const element = document.createElement(tag);
		Object.assign(element.style, styles);
		if (text !== undefined) element.textContent = text;
		return element;
	}

	// A new element of the card, styled by its class in CARD_STYLES.
	function classed(tag, className, text) {
		const element = document.createElement(tag);
		element.className = className;
		if (text !== undefined) element.textContent = text;
		return element;
	}

	function termOf(line) {
		const firstName = line.indexOf('`');
		const cuts = TERM_MARKS.map((mark) => ({ mark, at: line.indexOf(mark) })).filter(
			({ at }) => at > 0 && (firstName < 0 || at < firstName)
		);
		if (cuts.length === 0) return { term: null, how: line };
		const cut = cuts.reduce((first, other) => (other.at < first.at ? other : first));
		return { term: line.slice(0, cut.at), how: line.slice(cut.at + cut.mark.length) };
	}

	// A name in backticks: a sheet, or a sheet's column. The longest sheet that fits is the name's own, where one
	// sheet's name starts another's.
	function nameOf(name, sheets) {
		const sheet = sheets
			.filter((candidate) => name === candidate || name.startsWith(`${candidate}.`))
			.reduce((longest, candidate) => (longest && longest.length >= candidate.length ? longest : candidate), null);
		if (!sheet) return { name: true, sheet: null, column: name };
		return { name: true, sheet, column: name === sheet ? null : name.slice(sheet.length + 1) };
	}

	// A step's parts: words, signs and names.
	const partsOf = (step, sheets) =>
		step.split('`').flatMap((piece, index) =>
			index % 2 === 1
				? [nameOf(piece, sheets)]
				: piece
						.split(SIGNS)
						.filter((part) => part !== '')
						.map((part) => (SIGNS.test(part) ? { sign: part.trim() } : { text: part }))
		);

	// A calculation's steps as the card's lines: a step that names columns has a line of its own, and the steps in
	// numbers that follow it share the next one, "=" between them.
	function linesOf(steps) {
		const named = (parts) => parts.some((part) => part.name);
		return steps.reduce((stacked, parts, index) => {
			const last = stacked[stacked.length - 1];
			const joins = index > 0 && !named(parts) && !named(steps[index - 1]);
			const step = index > 0 ? [{ equals: true }, ...parts] : parts;
			return joins ? [...stacked.slice(0, -1), [...last, ...step]] : [...stacked, step];
		}, []);
	}

	// An explanation as a card: its rows, and the sheet most of its columns come from. That sheet is named once, at the
	// top, and left off its columns; a column of another sheet keeps its sheet.
	function cardOf(note, calc, sheets) {
		const rows = calc.split('\n').map((line) => {
			const { term, how } = termOf(line.replace(/\.$/, ''));
			return { term, lines: linesOf(how.split(STEP_MARK).map((step) => partsOf(step, sheets))) };
		});
		const columns = rows.flatMap((row) => row.lines.flat()).filter((part) => part.name && part.sheet && part.column);
		const named = columns.reduce((counts, part) => counts.set(part.sheet, (counts.get(part.sheet) ?? 0) + 1), new Map());
		const mostNamed = [...named].reduce((most, entry) => (most && most[1] >= entry[1] ? most : entry), null);
		return { note, rows, sheet: mostNamed ? mostNamed[0] : null };
	}

	// One part of a line: a name as code (with its sheet where that is not the card's own), a sign, or words.
	function partNode(part, index, card) {
		if (part.name) {
			const code = classed('span', 'dc-code');
			if (part.sheet && (part.sheet !== card.sheet || !part.column))
				code.append(classed('span', 'dc-other-sheet', `${part.sheet}${part.column ? ' › ' : ''}`));
			code.append(part.column ?? '');
			return code;
		}
		if (part.equals) return classed('span', index === 0 ? 'dc-equals dc-leads' : 'dc-equals', '=');
		if (part.sign) return classed('span', 'dc-sign', part.sign);
		return part.text;
	}

	// The card's content: what is explained, the sheet its columns come from, then a row a line.
	function tipContent(card, sheetWord) {
		const note = card.note && classed('div', 'dc-note', card.note);
		const sheet = card.sheet && classed('div', 'dc-sheet', `Columns are from the ${sheetWord} `);
		if (sheet) sheet.append(classed('span', 'dc-code', card.sheet));
		const rows = classed('div', note || sheet ? 'dc-rows dc-titled' : 'dc-rows');
		rows.append(
			...card.rows.flatMap((row) => {
				const how = classed('div', row.term ? 'dc-how' : 'dc-how dc-wide');
				how.append(
					...row.lines.map((parts, lineIndex) => {
						const line = classed('div', lineIndex > 0 ? 'dc-step' : '');
						line.append(...parts.map((part, partIndex) => partNode(part, partIndex, card)));
						return line;
					})
				);
				return row.term ? [classed('div', 'dc-term', row.term), how] : [how];
			})
		);
		return [note, sheet, rows].filter(Boolean);
	}

	// The line at a card's foot saying how to scroll it, by the pointer the window has.
	function moreHint() {
		const more = classed('div', 'dc-more');
		more.append(classed('span', 'dc-by-mouse', MORE_BY_MOUSE), classed('span', 'dc-by-touch', MORE_BY_TOUCH));
		return more;
	}

	// Whether an element is drawn: one under `display: none` has no boxes, and a hidden one leaves its space empty.
	const isShown = (element) =>
		element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';

	// The marks of the elements that show: each one's outline, cut to what the window and the boxes that scroll or clip
	// it show, so a figure scrolled out of view leaves no mark; and its badge, placed in turn, clear of the figures'
	// text. A badge may sit over a chart (an element drawing in an svg or canvas): a hover card's figures lie over
	// their chart.
	function measure(modal) {
		const holdsOthers = (element) => element.querySelector('[data-calc]') !== null;
		// Figures are placed before the boxes that hold them (a table before its column labels' frame), so each figure's
		// badge gets the spot beside its own text and the frame's takes a free one.
		const shown = [...document.querySelectorAll('[data-calc]')]
			.filter((element) => (!modal || modal.contains(element)) && isShown(element))
			.map((element) => ({ element, ...outlineOf(element) }))
			.filter(({ outline }) => outline !== null)
			.sort((a, b) => Number(holdsOthers(a.element)) - Number(holdsOthers(b.element)));
		// A box holding other explained elements, as a table holds its columns' labels, frames them rather than being a
		// figure's text.
		const texts = shown
			.filter(({ element }) => !element.querySelector('svg, canvas, [data-calc]'))
			.map(({ outline }) => outline);
		const badges = shown.reduce((placed, mark) => [...placed, placeBadge(mark, placed, texts)], []);
		return shown.map((mark, index) => ({
			element: mark.element,
			outline: mark.outline,
			badge: badges[index],
			calc: mark.element.getAttribute('data-calc'),
			note: mark.element.getAttribute('data-calc-note')
		}));
	}

	// The box of what an element shows: its text and the elements in it, not the empty rest of a block's width. An
	// element that clips its overflow (a timeline whose labels move out of it as it animates) shows only what lies
	// inside its own box.
	function contentBox(element) {
		const own = element.getBoundingClientRect();
		if (element instanceof SVGElement) return own;
		const range = document.createRange();
		range.selectNodeContents(element);
		const box = range.getBoundingClientRect();
		if (box.width === 0 || box.height === 0) return own;
		const style = getComputedStyle(element);
		if (style.overflowX === 'visible' && style.overflowY === 'visible') return box;
		const left = Math.max(box.left, own.left);
		const top = Math.max(box.top, own.top);
		const right = Math.min(box.right, own.right);
		const bottom = Math.min(box.bottom, own.bottom);
		return right > left && bottom > top ? { left, top, right, bottom, width: right - left, height: bottom - top } : own;
	}

	// The part of the window an element can show: the window, cut down to the content area (inside the border and the
	// padding) of every box around the element that clips or scrolls its overflow, so marks keep out of a scroll box's
	// gutter. A box cuts only across the way it clips. In the window's coordinates.
	function visibleArea(element) {
		let area = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
		for (let node = element.parentElement; node; node = node.parentElement) {
			const style = getComputedStyle(node);
			const clipsAcross = style.overflowX !== 'visible';
			const clipsDown = style.overflowY !== 'visible';
			if (!clipsAcross && !clipsDown) continue;
			const box = node.getBoundingClientRect();
			const inner = {
				left: box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
				top: box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop),
				right: box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
				bottom: box.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom)
			};
			area = {
				left: clipsAcross ? Math.max(area.left, inner.left) : area.left,
				right: clipsAcross ? Math.min(area.right, inner.right) : area.right,
				top: clipsDown ? Math.max(area.top, inner.top) : area.top,
				bottom: clipsDown ? Math.min(area.bottom, inner.bottom) : area.bottom
			};
		}
		return area;
	}

	// The part of `area` a table's first column, stuck at the left, leaves to the other cells of its row: the cells
	// scrolled under it show only right of it. Header cells all stick to the top, so a cell stuck at the left is one
	// whose left is set.
	function besideStickyCell(element, area) {
		const cell = element.closest('th, td');
		const sticky =
			cell &&
			[...cell.parentElement.children].find((other) => {
				const style = getComputedStyle(other);
				return other !== cell && style.position === 'sticky' && style.left !== 'auto';
			});
		return sticky ? { ...area, left: Math.max(area.left, sticky.getBoundingClientRect().right) } : area;
	}

	// The outline around what an element shows, with room around it, cut to the area it can show in, and whether its top
	// is cut off; null when none of it shows. With the area, for its badge.
	function outlineOf(element) {
		const box = contentBox(element);
		const area = besideStickyCell(element, visibleArea(element));
		// An element with nothing in it has no box to frame.
		if (box.width === 0 && box.height === 0) return { outline: null, area };
		const left = Math.max(box.left - OUTSET, area.left);
		const top = Math.max(box.top - OUTSET, area.top);
		const right = Math.min(box.right + OUTSET, area.right);
		const bottom = Math.min(box.bottom + OUTSET, area.bottom);
		const outline =
			right > left && bottom > top
				? { left, top, width: right - left, height: bottom - top, cutTop: box.top < area.top }
				: null;
		return { outline, area };
	}

	// A badge goes where it hides no figure's text (`texts`, outlines): just right of its own figure's top line, as a note
	// mark does, past the badges already there (a stack of lines makes a stair of them); else left of it, above it, or
	// inside its top left corner, the first of those in view that covers no other badge or text. Where none is, it goes
	// inside, moved along to the right past other badges.
	function placeBadge({ outline, area }, placed, texts) {
		const boxOf = (spot) => ({ ...spot, width: BADGE.width, height: BADGE.height });
		// Boxes overlap where they share more than `slack` pixels each way.
		const overlaps = (a, b, slack = 0) =>
			a.left < b.left + b.width - slack &&
			b.left < a.left + a.width - slack &&
			a.top < b.top + b.height - slack &&
			b.top < a.top + a.height - slack;
		const onBadge = (spot) => placed.some((other) => overlaps(boxOf(spot), boxOf(other)));
		// A text is what its outline holds, without the room the outline leaves around it; a badge touching the edge of its
		// box (Firefox's text boxes run a little below the letters) covers none of it.
		const textOf = (other) => ({
			left: other.left + OUTSET,
			top: other.top + OUTSET,
			width: other.width - 2 * OUTSET,
			height: other.height - 2 * OUTSET
		});
		const onText = (spot) =>
			texts.some((other) => other !== outline && overlaps(boxOf(spot), textOf(other), TEXT_SLACK));
		const inView = (spot) =>
			spot.left >= Math.max(area.left, 0) &&
			spot.left + BADGE.width <= Math.min(area.right, window.innerWidth) &&
			spot.top >= Math.max(area.top, 0);
		const pastBadges = (spot) =>
			onBadge(spot) && inView(spot) ? pastBadges({ ...spot, left: spot.left + BADGE.width }) : spot;
		// Centred on a line shorter than the badge, but never above the area: a chart's first row sits at its top.
		const lineTop = Math.max(area.top, 0, outline.top + Math.min(0, (outline.height - BADGE.height) / 2));
		const beside = pastBadges({ left: outline.left + outline.width + BADGE_GAP, top: lineTop });
		const before = { left: outline.left - BADGE_GAP - BADGE.width, top: lineTop };
		const above = { left: outline.left, top: outline.top - BADGE.height };
		const inside = { left: outline.left, top: outline.top };
		const spots = [beside, before, ...(outline.cutTop ? [] : [above]), inside];
		return spots.find((spot) => inView(spot) && !onBadge(spot) && !onText(spot)) ?? pastBadges(inside);
	}

	// The explanation's card, inside the window: under its badge in the window's top part and over it lower down, on
	// the other side where it only fits there, and against the window's bottom edge where it fits on neither.
	function placeTip(badge, width, height) {
		const left = Math.max(EDGE, Math.min(badge.left, window.innerWidth - width - EDGE));
		const below = badge.top + BADGE.height + EDGE;
		const above = badge.top - EDGE - height;
		const sides = [
			{ top: below, fits: below + height <= window.innerHeight - EDGE },
			{ top: above, fits: above >= EDGE }
		];
		const preferred = badge.top < OPEN_BELOW ? sides : [...sides].reverse();
		const side = preferred.find(({ fits }) => fits);
		return { left, top: side ? side.top : Math.max(EDGE, window.innerHeight - EDGE - height) };
	}

	// A phone has no hovering pointer, yet its tap sends mouseenter before its click. Opening the card on that would
	// put the card (which a finger can touch, to scroll it) under the finger, and the click would land on the card
	// and close it. So only a pointer that hovers opens a card by entering its badge.
	const hovers = () => !matchMedia('(hover: none)').matches;

	function initDataDebugOverlay(options) {
		if (current) current.destroy();
		const config = { ...DEFAULTS, ...options };
		const files = Object.values(config.sources ?? {}).join(' · ');
		const sheets = Object.values(config.sheets ?? {});
		let enabled = false;
		let frame = null;
		// The overlay's layer and the hint along its foot, there while the overlay is on.
		let root = null;
		let foot = null;
		// Each marked element's outline and badge, kept from frame to frame so a hovered badge stays the same node.
		const nodes = new Map();
		// The element whose badge is hovered or was tapped, its explanation's card, and what the card was filled from.
		let tipElement = null;
		let tip = null;
		let tipKey = null;

		function readHash() {
			setEnabled(window.location.hash === HASH);
		}

		function setEnabled(on) {
			if (on === enabled) return;
			enabled = on;
			if (enabled) {
				addRoot();
				drawEachFrame();
			} else {
				cancelAnimationFrame(frame);
				root.remove();
				nodes.clear();
				frame = root = foot = tipElement = tip = tipKey = null;
			}
			document.documentElement.toggleAttribute(ON_ATTRIBUTE, enabled);
			window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { on: enabled } }));
		}

		function addRoot() {
			root = create('div', { position: 'fixed', inset: '0', zIndex: '9999', pointerEvents: 'none' });
			root.setAttribute('data-calc-overlay', '');
			root.style.setProperty('--dc-accent', config.accent);
			foot = create('div', {
				position: 'absolute',
				bottom: '16px',
				left: '50%',
				transform: 'translateX(-50%)',
				width: 'max-content',
				maxWidth: 'calc(100vw - 16px)',
				borderRadius: '8px',
				background: '#1b1b1b',
				padding: '8px 16px',
				textAlign: 'center',
				fontSize: '12px',
				lineHeight: '1.4',
				color: '#fff',
				boxShadow: '0 6px 20px rgba(0,0,0,.3)'
			});
			foot.append(create('div', {}, HINT));
			if (files) foot.append(create('div', { color: 'rgba(255,255,255,.7)' }, `Source files: ${files}`));
			root.append(create('style', {}, CARD_STYLES), foot);
			document.body.append(root);
		}

		// Measured every frame while on: charts animate, pages and tables scroll, and cards come and go.
		function drawEachFrame() {
			draw();
			frame = requestAnimationFrame(drawEachFrame);
		}

		function draw() {
			// The layer sits in the open modal <dialog> (the top layer, where everything else is inert), else in the body.
			const modal = document.querySelector(config.modalSelector);
			const into = modal instanceof HTMLDialogElement ? modal : document.body;
			if (root.parentElement !== into) into.append(root);
			// Where the layer's corner is, in the window's coordinates, in which everything is measured: (0, 0) but where a
			// browser puts fixed boxes against the visible part of a zoomed or scrolled phone page instead. Marks are drawn
			// from it.
			const corner = root.getBoundingClientRect();
			const origin = { left: corner.left, top: corner.top };
			const marks = measure(modal);
			const marked = new Set(marks.map((mark) => mark.element));
			for (const [element, node] of nodes) {
				if (marked.has(element)) continue;
				node.box.remove();
				node.badge.remove();
				nodes.delete(element);
			}
			for (const mark of marks) {
				const node = nodes.get(mark.element) ?? addNode(mark.element);
				Object.assign(node.box.style, {
					left: px(mark.outline.left - origin.left),
					top: px(mark.outline.top - origin.top),
					width: px(mark.outline.width),
					height: px(mark.outline.height)
				});
				Object.assign(node.badge.style, {
					left: px(mark.badge.left - origin.left),
					top: px(mark.badge.top - origin.top)
				});
			}
			// A badge gone from view (scrolled away, or its card closed) takes its explanation with it.
			const tipMark = marks.find((mark) => mark.element === tipElement);
			if (tipMark) showTip(tipMark, origin);
			else hideTip();
		}

		// An element's outline and badge, under the foot's hint.
		function addNode(element) {
			const box = create('div', {
				position: 'absolute',
				boxSizing: 'border-box',
				borderRadius: '6px',
				border: `1px dashed ${config.accent}`
			});
			const badge = create(
				'span',
				{
					position: 'absolute',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: px(BADGE.width),
					height: px(BADGE.height),
					borderRadius: '6px 6px 0 0',
					background: config.accent,
					fontSize: '11px',
					fontWeight: '600',
					lineHeight: '1',
					color: '#fff',
					cursor: 'help',
					pointerEvents: 'auto'
				},
				'ƒx'
			);
			badge.setAttribute('data-calc-badge', '');
			// A tap's click opens the explanation too: a badge that appears where the last tap was gets no mouseenter from
			// the next. The card follows at the next frame.
			const open = () => (tipElement = element);
			badge.addEventListener('mouseenter', () => hovers() && open());
			badge.addEventListener('click', open);
			// Leaving a badge closes its card, except onto the card itself: on a phone the card may cover its badge.
			badge.addEventListener('mouseleave', (event) => {
				if (tipElement === element && !(tip && tip.contains(event.relatedTarget))) tipElement = null;
			});
			badge.addEventListener('wheel', scrollTip, { passive: false });
			root.insertBefore(box, foot);
			root.insertBefore(badge, foot);
			const node = { box, badge };
			nodes.set(element, node);
			return node;
		}

		// A mouse stays on the badge (leaving it closes the card), so the wheel over the badge scrolls a card taller than
		// the window.
		function scrollTip(event) {
			if (!tip || tip.scrollHeight <= tip.clientHeight) return;
			event.preventDefault();
			tip.scrollBy({ top: event.deltaY });
		}

		function showTip(mark, origin) {
			if (!tip) {
				tip = classed('div', 'dc-tip');
				tip.setAttribute('data-calc-tip', '');
				// Only a finger reaches the card (see CARD_STYLES): a tap on it closes it.
				tip.addEventListener('click', hideTip);
				root.append(tip);
			}
			// Filled again when the window's size changes, which changes whether the card holds more than it shows.
			const key = [mark.note ?? '', mark.calc, window.innerWidth, window.innerHeight].join('\n');
			if (key !== tipKey) {
				tipKey = key;
				tip.replaceChildren(...tipContent(cardOf(mark.note, mark.calc, sheets), config.sheetWord));
				if (tip.scrollHeight > tip.clientHeight) tip.append(moreHint());
			}
			const place = placeTip(mark.badge, tip.offsetWidth, tip.offsetHeight);
			Object.assign(tip.style, { left: px(place.left - origin.left), top: px(place.top - origin.top) });
		}

		function hideTip() {
			tipElement = null;
			if (!tip) return;
			tip.remove();
			tip = tipKey = null;
		}

		// Esc turns the overlay off and takes the hash off the address, so a reload leaves it off. With a modal open,
		// Esc closes that instead.
		function exitOnEscape(event) {
			if (event.key !== 'Escape' || !enabled || document.querySelector(config.modalSelector)) return;
			history.replaceState(null, '', window.location.pathname + window.location.search);
			readHash();
		}

		const overlay = {
			destroy() {
				window.removeEventListener('hashchange', readHash);
				window.removeEventListener('keydown', exitOnEscape);
				setEnabled(false);
				if (current === overlay) current = null;
			}
		};
		window.addEventListener('hashchange', readHash);
		window.addEventListener('keydown', exitOnEscape);
		current = overlay;
		readHash();
		return overlay;
	}

	// Expose + auto-init for drop-in <script> usage: on load, unless the page has made its own overlay by then.
	if (typeof window !== 'undefined') {
		window.initDataDebugOverlay = initDataDebugOverlay;
		const initOnLoad = () => current || initDataDebugOverlay();
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initOnLoad);
		else initOnLoad();
	}
	if (typeof module !== 'undefined' && module.exports) module.exports = { initDataDebugOverlay };
})();
