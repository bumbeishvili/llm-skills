---
name: data-debug
description: Tag each data-driven UI element with a `data-calc` explanation (what the figure shows, its formula in named values with their source columns, and the source's real numbers through that formula), then add `#debug` to the URL to check them in the browser. Every tagged chart, figure, table and filter gets a ƒx badge that opens its explanation as a card on hover or tap. Use when building dashboards, charts, stat tiles or any figure derived from data, when asked for a data debug or `#debug` overlay, and when someone asks where a number on the page came from. Ships a zero-dependency vanilla overlay (`data-debug-overlay.js`), a Svelte + Tailwind component (`DataDebugOverlay.svelte`) and a sweep that collects every explanation of a running app (`check-explanations.cjs`).
---

# data-debug (`data-calc`)

Point at any number on the page and read how it was worked out from the source files, without opening the code. Two attributes on the element carry the explanation; an overlay shows it as a card when the URL ends in `#debug`.

The reader is the person who owns the data, checking a number on the page against their workbook. They know the sheets and their columns, and they have not seen the code. A card works when they can reproduce the printed figure from it with the source open beside it.

## The two attributes

- **`data-calc`**: the explanation, one row of the card per line (a newline between lines).
- **`data-calc-note`**: the card's title, a few words naming what is explained: "Repeat customers", "Revenue by week". A table's column header goes without one, since the header names it.

```html
<span
  data-calc-note="Repeat customers"
  data-calc="Shows: of the customers who ordered in 2025, the share who ordered more than once
Repeat customers = `Customers.Orders (#)` above 1, counted = 412
All customers = `Orders 2025.Customer ID`, each counted once = 1,630
Figure = repeat customers ÷ all customers = 412 ÷ 1,630 = 25.3%"
>
  25.3%
</span>
```

Put both on the smallest element that holds the figure's text or the chart: the value's `<span>`, the chart's container. The outline frames what that element shows, and the badge sits beside it.

## Writing an explanation

A chart's or a figure's card has three parts, in this order (filters and tables have their own, under [What gets a badge](#what-gets-a-badge)):

1. **`Shows:`** what the numbers mean, in plain words. One line.
2. **The formula in named values:** "Each bar = share of returns ÷ share of orders × return rate". Every named value gets a line of its own with its column and what the column holds: "Share of returns = `Returns.Share`, the part of all returned orders that came through the channel".
3. **The source's real numbers through the formula, for every figure the element shows,** ending on the figure as the page prints it: "Online = 63.16% ÷ 41.10% × 2.33% = 3.6%".

Every line belongs to one of those three parts. Leave out a line listing which of the sheet's rows were read (the year or region goes in brackets after the column), a line arguing why the calculation is right, definitions of the domain's terms, notes defending a data choice, and hedges such as "unless another is named" or "which is".

### Lines

The overlay lays the card out from each line's shape:

- **`term = how` or `term: how`.** The term goes in the card's left column, how it is worked out in the right. A line without a term runs the card's width.
- **Each further ` = ` is the next step:** "Figure = `Customers.Orders (#)` ÷ `Orders 2025.Customer ID` = 412 ÷ 1,630 = 25.3%". The step that names columns gets a line of its own, and the steps in numbers share the next.
- **Arithmetic signs stand between spaces:** ` ÷ `, ` × `, ` + `, ` − ` (the minus sign, which a hyphen does not stand in for). The card highlights them.
- **One line per item the element shows:** each bar, segment, point label or reference line. A long series gives its first and last items and every value the chart labels.
- **Write every column and every item out.** A run such as "the five reason columns" or a stand-in such as "a reason ÷ all" leaves the reader to work out which is meant.

### Names

- **A column is `sheet.column`, in backticks:** the workbook's sheet (or the file's name without its extension), then the header, both spelled exactly as in the source, so a search of the file finds it.
- **A header that repeats in its sheet takes its group header in front:** `Orders 2025.Online Total`.
- **A count that shares a header with its percentage carries `(#)`:** `Regions.Orders (#)`.
- **The year or region a figure reads goes in brackets after the column:** "`Regions.Orders (#)` (North West)".

### Numbers

- **They come from the data module the page reads,** formatted by the explanation's own helpers. A number typed into an explanation goes stale with the next data update.
- **Counts in full:** 1,204,300. Say the page's rounding at the end of the line: ", in millions", ", rounded up to the nearest 5,000".
- **A share or rate that feeds a further calculation keeps two decimal places,** so the result reproduces: with one decimal, "22.0% − 18.2%" printed "+3.7 points".

### Why this shape

Each rule answers a correction from a review of a live dashboard's cards:

- A compressed card (runs of columns, stand-ins) had to be decoded. The card is a checking tool and has room for every line.
- A formula over column names alone did not say what the columns hold, so the reader could not tell why one was divided by the other.
- Without the numbers the reader could not see how the chart's values came out.
- Lines about rows, reasons, definitions and caveats read as noise around the three parts.

## What gets a badge

- **One per chart, and one per figure on a card or tile.** A chart's card covers all its marks, a line each. A badge on every bar or bubble hides the chart.
- **One per filter control,** a line per option saying which columns or rows it selects: "Women: the Female columns, such as `Orders 2025.Female Total`", "Keeps: the years from the first chosen to the last, by `Orders 2025.Year`".
- **One for a table's rows** ("One row for each year, 2001–2025, newest first") **and one per column header:** "Each cell = `Orders 2025.Returned` ÷ `Orders 2025.Orders (#)`", then one row in numbers, "2025 row = 38 ÷ 1,630 = 2.3%".
- **One per figure inside a hover card or tooltip.** The card has to stay open while the overlay is on; see [Hover cards](#hover-cards).

An explanation is built for the state in view. With Women chosen in a filter, the chart's card names the Female columns and carries the women's numbers.

## One module for the explanations

Build the explanations in one module and hand each component its own, so sheet and column names are written once and a shared line (an overall rate several cards start from) reads the same everywhere.

- An explanation is `{ note, calc }`. A builder takes what changes the figure (the filters, the selected item) and returns the explanation with that state's columns and numbers.
- Sheet names sit in one table at the top of the module. Export their list for the overlay, which uses it to tell a sheet from its column.
- A component takes its explanation as a prop and spreads the attributes onto the element. Passed `null`, it carries no badge.

```js
const code = (name) => `\`${name}\``;
const lines = (...steps) => steps.flat(Infinity).filter(Boolean).join('\n');
const explanation = (note, ...steps) => ({ note, calc: lines(...steps) });

const SHEETS = { orders: 'Orders 2025', customers: 'Customers' };
export const SOURCE_SHEETS = Object.values(SHEETS);
const column = (id, header) => code(`${SHEETS[id]}.${header}`);

const count = (value) => value.toLocaleString('en-GB');
const share = (value) => `${(value * 100).toFixed(1)}%`; // as the page prints it
const exact = (value) => `${(value * 100).toFixed(2)}%`; // feeds a further calculation
const divided = (part, whole) => `${count(part)} ÷ ${count(whole)} = ${share(part / whole)}`;

export const calcAttributes = (item) => (item ? { 'data-calc': item.calc, 'data-calc-note': item.note } : {});
// The explanation with one more line, as a view that adds a callout does.
export const withStep = (item, step) => ({ ...item, calc: lines(item.calc, step) });

export const EXPLAIN = {
  repeatCustomers: ({ repeat, all }) =>
    explanation(
      'Repeat customers',
      'Shows: of the customers who ordered in 2025, the share who ordered more than once',
      `Repeat customers = ${column('customers', 'Orders (#)')} above 1, counted = ${count(repeat)}`,
      `All customers = ${column('orders', 'Customer ID')}, each counted once = ${count(all)}`,
      `Figure = repeat customers ÷ all customers = ${divided(repeat, all)}`
    )
};
```

```svelte
<span {...calcAttributes(calc)}>{value}</span>
```

## The inspector

- **`#debug` on any URL turns it on.** Every `[data-calc]` element that shows gets a dashed outline and a **ƒx** badge. Hovering or tapping the badge opens its card. **Esc, or removing the hash, turns it off.**
- **The card** has the title, then "Columns are from the sheet X" for the sheet most of its columns name, then a row per line: the term on the left, the working on the right. That sheet's columns show alone; a column of another sheet shows as "sheet › column" with the sheet dimmed. In a window 640px wide or narrower the term sits over its working.
- **The card stays inside the window.** It opens under its badge in the window's top part and over it lower down, on the other side where it only fits there, and against the bottom edge where it fits on neither. A card taller than the window scrolls: with a mouse by the wheel over the badge, on a touch screen by a finger drag. A tap on the card closes it. Its foot says "More below" while it holds more than it shows.
- **Marks follow what shows.** The outline frames the element's content, cut to the part visible in the window and in every scrolling or clipping box around it. An element that is scrolled out of view, hidden, or under `display: none` has no mark.
- **Badges keep clear of the figures' text.** A badge goes right of its figure's first line; else left of it, above it, or inside its top left corner, the first spot that covers no other badge and no figure's text. Figures get their spots before the boxes that hold them.
- **Modal-aware.** While a modal is open, only *its* marks show, and Esc closes the modal before the overlay. The overlay finds the modal by selector (`.fixed.inset-0.z-50, [aria-modal="true"], [role="dialog"], dialog[open]`) and moves its layer into an open `<dialog>`, which is the top layer.
- **Re-measures every animation frame,** because charts animate in, tables scroll and cards mount asynchronously.
- **Lists the source files along the foot** when given `sources`.

## Install

Both overlays read the same two attributes, draw the same card and take the same inputs:

| Input | What it is |
| --- | --- |
| `sources` | The source files' names, as a list or an object whose values are the names. Shown along the foot. |
| `sheets` | What comes before the dot in the explanations' names, spelled the same: the workbook's sheets, or the files without their extensions. Without it every name shows whole and the card has no sheet line. |
| `sheetWord` | What one of those is called in "Columns are from the … X". Default `'sheet'`; `'file'` or `'table'` for other sources. |

**Framework-agnostic**: [`data-debug-overlay.js`](data-debug-overlay.js), zero dependencies. It also takes `accent` and `modalSelector`.

```html
<script src="/data-debug-overlay.js"></script>
<!-- auto-inits on load; or call it yourself for options (the call replaces the automatic one): -->
<script>
  initDataDebugOverlay({ sources: ['orders-2025.xlsx'], sheets: ['Orders 2025', 'Customers'] });
</script>
```

For React or Vue, call `initDataDebugOverlay` in an effect that runs once on mount, and call the returned `destroy()` on unmount.

**Svelte + Tailwind**: [`DataDebugOverlay.svelte`](DataDebugOverlay.svelte), written for SvelteKit in Svelte 4 syntax, which Svelte 5 compiles beside runes components. Mount it **once**, after the page slot: in the root layout to cover every route, or in a section's layout to cover only that section's pages.

```svelte
<slot />
<DataDebugOverlay sources={SOURCE_FILES} sheets={SOURCE_SHEETS} />
```

The component imports `browser` and `goto` from SvelteKit's `$app` modules. In plain Svelte, use `typeof window !== 'undefined'` for `browser`, and `history.replaceState(history.state, '', location.pathname + location.search)` for the `goto` call.

## Hover cards

A figure inside a hover card has its badge outside the mark that opened the card, so the card has to stay open while the pointer travels to the badge. Each overlay tells the page when it is on:

| | Svelte component | Vanilla file |
| --- | --- | --- |
| Is it on? | `$dataDebugOn` (a store) | `document.documentElement.hasAttribute('data-calc-debug')` |
| It turned off | `onDebugEnd(release)` returns its unsubscribe | `data-debug-change` event on `window`, `event.detail.on` is `false` |
| Its layer | `DEBUG_LAYER` | `'[data-calc-overlay]'` |

Wire a card in three places:

- **Hiding on pointer leave:** skip the hide while the overlay is on.
- **Overlay turned off:** hide the card it kept open.
- **Closing on a tap away:** treat a tap inside the overlay's layer as a tap on the card, so tapping a badge keeps the card.

```svelte
<script>
  import { onDestroy } from 'svelte';
  import { dataDebugOn, onDebugEnd, DEBUG_LAYER } from './DataDebugOverlay.svelte';

  onDestroy(onDebugEnd(hideCard));

  function hideCardSoon() {
    if (!$dataDebugOn) hideTimer = setTimeout(hideCard, HIDE_DELAY);
  }

  function closeOnTapAway(event) {
    if (!event.target.closest(`[data-card], ${DEBUG_LAYER}`)) hideCard();
  }
</script>
```

## Checking

- **Change a figure's explanation in the same edit that changes the figure.** A stale explanation gives no signal: the badge keeps showing the old one. When you can't state the source, resolve where the value comes from before shipping it.
- **Sweep every state with [`check-explanations.cjs`](check-explanations.cjs).** Write one address a line for every state that changes a figure (each route, view, filter value, selected item and open table), then run it against the running app from a copy inside the project, where Node resolves Playwright:

  ```bash
  node .claude/skills/data-debug/check-explanations.cjs http://localhost:5173 addresses.txt explanations.txt --flag "\ba reason\b"
  ```

  It opens each address at a desktop and a phone window, writes every distinct explanation to the out file, and reports page errors, addresses that carry no explanation, and explanations with a value that did not format (`undefined`, `NaN`), shortened text, an unclosed column name, an empty side of "=", or a line the convention leaves out. `--flag` adds a stand-in of your own to look for; `--block` aborts a third-party widget's requests. A flag is a prompt to read that card. Keep each state reachable through the address so the sweep can open it.
- **Read the out file against the source.** For each card, find the columns it names in the workbook and work the printed figure out from the card's numbers.
- **Open the cards in the browser with `#debug` on,** at a desktop and a phone width: every chart, figure, table and filter control has a badge, the longest card scrolls, and the badges inside each hover card can be reached.
