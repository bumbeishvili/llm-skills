<script context="module">
	import { writable } from 'svelte/store';

	// Whether the overlay is on. A hover card reads it to stay open while it is, so the pointer can leave the chart
	// for the badges of the card's figures.
	export const dataDebugOn = writable(false);
	// The overlay's layer, which a tap on a badge lands in: a card that closes on a tap away from it lets these through.
	export const DEBUG_LAYER = '[data-calc-overlay]';

	// Calls `release` each time the overlay turns off, for a hover card it kept open to go; returns the function that
	// stops the calls, for onDestroy.
	export function onDebugEnd(release) {
		let on = false;
		return dataDebugOn.subscribe((now) => {
			if (on && !now) release();
			on = now;
		});
	}
</script>

<script>
	// The `data-calc` inspector (Svelte + Tailwind, written for SvelteKit). `#debug` on an address turns it on: every
	// element with an explanation (`data-calc`, and `data-calc-note` naming what it explains) gets a dashed outline and
	// a ƒx badge, and hovering or tapping a badge shows how the figure was worked out, as a card: its title, the sheet
	// most of its columns come from, then a row a line, the line's term on the left and how it is worked out on the
	// right. It stays on from page to page until Esc, or taking the hash off the address, turns it off. Mount it once,
	// after the page slot, in the layout of the pages it covers. For a zero-dependency drop-in, use
	// data-debug-overlay.js.
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';

	// The source files the explanations name, as a list or as { key: file }, shown along the foot.
	export let sources = [];
	// What comes before the dot in the explanations' names (`sheet.column`): a workbook's sheets, or the files without
	// their extensions, spelled as the explanations spell them. With them a card names its main sheet once and shows
	// that sheet's columns alone; without them every name shows whole.
	export let sheets = [];
	// What one of those is called in the card's "Columns are from the … X" line: 'sheet', 'file', 'table'.
	export let sheetWord = 'sheet';

	const HASH = '#debug';
	// While one of these is open only its marks show: badges of the page under it would read as part of it.
	const MODAL = '.fixed.inset-0.z-50, [aria-modal="true"], [role="dialog"], dialog[open]';
	// The outline's distance from its element, the badge's size as its classes set it (w-[26px] h-[22px]), and the
	// space between a badge and the outline it follows.
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

	let enabled = false;
	let marks = [];
	let frame = null;
	// Where the layer sits: the open modal <dialog> (the top layer, where everything else is inert), else the body.
	let container = null;
	// The overlay's layer and where its corner is, in the window's coordinates, in which everything is measured: (0, 0)
	// but where a browser puts fixed boxes against the visible part of a zoomed or scrolled phone page instead (WebKit's
	// phone emulation, 16px up). Marks are drawn from it.
	let layer;
	let origin = { left: 0, top: 0 };
	// The element whose badge is hovered or was tapped, and the explanation card with its measured size.
	let tipElement = null;
	let tipCard;
	let tipWidth = 0;
	let tipHeight = 0;
	// Whether the card holds more than it shows, so it says how to scroll it.
	let tipOverflows = false;

	$: dataDebugOn.set(enabled);
	$: if (browser) follow(enabled);
	$: tip = tipElement && marks.find((mark) => mark.element === tipElement);
	// The card is built from the explanation's text, so it is built once per explanation, not once per frame.
	$: tipNote = tip ? tip.note : null;
	$: tipCalc = tip ? tip.calc : null;
	$: card = tipCalc === null ? null : cardOf(tipNote, tipCalc, Object.values(sheets ?? {}));
	$: tipPlace = tip && placeTip(tip.badge, tipWidth, tipHeight);
	$: files = Object.values(sources ?? {}).join(' · ');

	function readHash() {
		enabled = location.hash === HASH;
	}

	// Measured every frame while on: charts animate, pages and tables scroll, and cards come and go.
	function follow(enabled) {
		cancelAnimationFrame(frame);
		frame = null;
		if (enabled) measureEachFrame();
		else {
			marks = [];
			tipElement = null;
		}
	}

	function measureEachFrame() {
		const modal = document.querySelector(MODAL);
		const into = modal instanceof HTMLDialogElement ? modal : document.body;
		if (into !== container) container = into;
		const corner = layer?.getBoundingClientRect();
		if (corner && (corner.left !== origin.left || corner.top !== origin.top))
			origin = { left: corner.left, top: corner.top };
		marks = measure(modal);
		// A badge gone from view (scrolled away, or its card closed) takes its explanation with it.
		if (tipElement && !marks.some((mark) => mark.element === tipElement)) tipElement = null;
		// Read here, a frame after the card is drawn: a reactive statement would read the card before it is.
		const overflows = Boolean(tipCard) && tipCard.scrollHeight > tipCard.clientHeight;
		if (overflows !== tipOverflows) tipOverflows = overflows;
		frame = requestAnimationFrame(measureEachFrame);
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

	// Leaving a badge closes its card, except onto the card itself: on a phone the card may cover its badge.
	function leaveBadge(event, element) {
		if (tipElement === element && !tipCard?.contains(event.relatedTarget)) tipElement = null;
	}

	// A mouse stays on the badge (leaving it closes the card), so the wheel over the badge scrolls a card taller than
	// the window.
	function scrollTip(event) {
		if (!tipCard || tipCard.scrollHeight <= tipCard.clientHeight) return;
		event.preventDefault();
		tipCard.scrollBy({ top: event.deltaY });
	}

	// Esc turns the overlay off and takes the hash off the address, so a reload leaves it off. SvelteKit's router owns
	// the address, so the change goes through it. With a modal open, Esc closes that instead.
	function exitOnEscape(event) {
		if (event.key !== 'Escape' || !enabled || document.querySelector(MODAL)) return;
		enabled = false;
		if (location.hash === HASH)
			goto(`${location.pathname}${location.search}`, { replaceState: true, noScroll: true, keepFocus: true });
	}

	// Moves the layer into `target` (see `container`). The {#if} block holds the layer alone, so Svelte still removes
	// it wherever it sits.
	function portal(node, target) {
		const move = (to) => to && to !== node.parentElement && to.append(node);
		move(target);
		return { update: move };
	}

	onMount(readHash);
	onDestroy(() => {
		if (browser) cancelAnimationFrame(frame);
		dataDebugOn.set(false);
	});
</script>

<svelte:window on:hashchange={readHash} on:keydown={exitOnEscape} />

{#if enabled}
	<!-- data-calc-overlay is DEBUG_LAYER. -->
	<div class="pointer-events-none fixed inset-0 z-[9999]" bind:this={layer} use:portal={container} data-calc-overlay>
		{#each marks as mark (mark.element)}
			<div
				class="mark absolute rounded-md border border-dashed"
				style:left="{mark.outline.left - origin.left}px"
				style:top="{mark.outline.top - origin.top}px"
				style:width="{mark.outline.width}px"
				style:height="{mark.outline.height}px"
			></div>
			<!-- A tap's click opens the explanation too: a badge that appears where the last tap was gets no mouseenter
			     from the next. -->
			<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
			<span
				class="badge pointer-events-auto absolute flex h-[22px] w-[26px] cursor-help items-center justify-center rounded-t-md text-[11px] font-semibold leading-none"
				style:left="{mark.badge.left - origin.left}px"
				style:top="{mark.badge.top - origin.top}px"
				data-calc-badge
				on:mouseenter={() => hovers() && (tipElement = mark.element)}
				on:click={() => (tipElement = mark.element)}
				on:mouseleave={(event) => leaveBadge(event, mark.element)}
				on:wheel|nonpassive={scrollTip}
			>
				ƒx
			</span>
		{/each}

		{#if tip && card}
			<!-- What is explained, the sheet its columns come from, then a row a line. A card taller than the window
			     scrolls, by touch or with the wheel over its badge. Only a finger reaches the card (see .tip): a tap on
			     it closes it. -->
			<!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
			<div
				class="tip absolute z-10 max-h-[calc(100dvh-16px)] w-max max-w-[min(720px,calc(100vw-16px))] overflow-y-auto overscroll-contain rounded-lg border px-5 py-4 text-left text-[14px] leading-[1.5] shadow-xl"
				style:left="{tipPlace.left - origin.left}px"
				style:top="{tipPlace.top - origin.top}px"
				style:visibility={tipWidth && tipHeight ? 'visible' : 'hidden'}
				bind:offsetWidth={tipWidth}
				bind:offsetHeight={tipHeight}
				bind:this={tipCard}
				on:click={() => (tipElement = null)}
				data-calc-tip
			>
				{#if card.note}
					<p class="note text-[16px] font-semibold">{card.note}</p>
				{/if}
				{#if card.sheet}
					<p class="sheet mt-1 text-[12px]">
						Columns are from the {sheetWord} <code class="code rounded px-1 font-mono">{card.sheet}</code>
					</p>
				{/if}
				<dl class="rows" class:titled={card.note || card.sheet}>
					{#each card.rows as row}
						{#if row.term}
							<dt class="term font-semibold">{row.term}</dt>
						{/if}
						<dd class="how" class:wide={!row.term}>
							{#each row.lines as parts, lineIndex}
								<!-- A line's parts sit on one source line, so no space comes between a name and the comma after it. -->
								<p class:step={lineIndex > 0}>{#each parts as part, partIndex}{#if part.name}<code class="code rounded px-1 font-mono text-[13px]">{#if part.sheet && (part.sheet !== card.sheet || !part.column)}<span class="other-sheet">{part.sheet}{part.column ? ' › ' : ''}</span>{/if}{part.column ?? ''}</code>{:else if part.equals}<span class="equals" class:leads={partIndex === 0}>=</span>{:else if part.sign}<span class="sign">{part.sign}</span>{:else}{part.text}{/if}{/each}</p>
							{/each}
						</dd>
					{/each}
				</dl>
				{#if tipOverflows}
					<p class="more sticky -bottom-4 -mx-5 -mb-4 px-5 py-2 text-[12px]">
						<span class="by-mouse">More below: turn the mouse wheel over the ƒx badge</span>
						<span class="by-touch">More below: drag to scroll, tap to close</span>
					</p>
				{/if}
			</div>
		{/if}

		<div
			class="hint absolute bottom-4 left-1/2 w-max max-w-[calc(100vw-16px)] -translate-x-1/2 rounded-lg px-4 py-2 text-center text-[12px] leading-[1.4] shadow-lg"
		>
			<p>Data debug: hover or tap a ƒx badge to see how it was worked out. Esc to exit.</p>
			{#if files}
				<p class="files">Source files: {files}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* A debug tool, so its colours sit outside the site's palette and stand out from it. */
	[data-calc-overlay] {
		--debug-accent: #5450f8;
		--debug-ink: #1b1b1b;
		--debug-sign: #ffd166;
	}

	.mark {
		border-color: var(--debug-accent);
	}

	.badge {
		background: var(--debug-accent);
		color: #fff;
	}

	.tip {
		border-color: var(--debug-accent);
		background: var(--debug-ink);
		color: #e3e8ff;
	}

	/* How to scroll a card that holds more than it shows, kept at its foot. */
	.more {
		border-top: 1px solid rgb(255 255 255 / 0.14);
		background: var(--debug-ink);
		color: var(--debug-sign);
	}

	.by-touch {
		display: none;
	}

	/* Touch screens: the card takes the finger, so a card taller than the window can be scrolled. */
	@media (hover: none) {
		.tip {
			pointer-events: auto;
		}

		.by-mouse {
			display: none;
		}

		.by-touch {
			display: inline;
		}
	}

	.note,
	.term {
		color: #fff;
	}

	.sheet {
		color: rgb(255 255 255 / 0.7);
	}

	/* A row a line: its term, then how it is worked out. A rule sets each row off from the one above. */
	.rows {
		display: grid;
		grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
	}

	.rows.titled {
		margin-top: 12px;
	}

	.term,
	.how {
		border-top: 1px solid rgb(255 255 255 / 0.14);
		padding-block: 5px;
	}

	.term {
		max-width: 16rem;
		padding-right: 20px;
	}

	.wide {
		grid-column: 1 / -1;
	}

	/* A calculation's next steps, each under the one before, behind its "=". */
	.step {
		margin-top: 2px;
	}

	.equals,
	.sign {
		margin-inline: 8px;
		color: var(--debug-sign);
		font-weight: 600;
	}

	.equals.leads {
		margin-left: 0;
	}

	/* A name moves to the next line whole, and breaks only where it is longer than a line. */
	.code {
		display: inline-block;
		max-width: 100%;
		background: rgb(255 255 255 / 0.1);
		color: #fff;
	}

	.other-sheet {
		color: rgb(255 255 255 / 0.6);
	}

	/* A narrow window: the term over how it is worked out, the rule above the term alone. */
	@media (max-width: 640px) {
		.rows {
			grid-template-columns: minmax(0, 1fr);
		}

		.term {
			max-width: none;
			padding-bottom: 0;
		}

		.term + .how {
			border-top: 0;
			padding-top: 2px;
		}
	}

	.hint {
		background: var(--debug-ink);
		color: #fff;
	}

	.files {
		color: rgb(255 255 255 / 0.7);
	}
</style>
