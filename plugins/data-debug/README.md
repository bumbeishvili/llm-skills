# data-debug

Check a page's numbers against their source without opening the code. Tag each figure with a `data-calc` explanation: what it shows, its formula in named values with their source columns (`sheet.column`), and the source's real numbers through that formula. Then add `#debug` to the URL: every tagged chart, figure, table and filter gets a ƒx badge that opens its explanation as a card on hover or tap.

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

## Install

```bash
npx degit bumbeishvili/claude-skills/plugins/data-debug/skills/data-debug .claude/skills/data-debug
mkdir -p .agents/skills && ln -s ../../.claude/skills/data-debug .agents/skills/data-debug
```

Needs `npx`. The first line installs the skill for Claude Code, the second links it for Codex. Invoke with `/data-debug` in Claude Code or `$data-debug` in Codex, or ask to make a chart's numbers traceable.

## What it covers

`skills/data-debug/SKILL.md` has the rules for writing an explanation, what gets a badge, how to keep the explanations in one module, how the card is laid out and scrolls, and how to keep a hover card open while its figures are inspected. Two overlays read the attributes and draw the same card: `data-debug-overlay.js`, zero-dependency and framework-agnostic, and `DataDebugOverlay.svelte` for SvelteKit + Tailwind. `check-explanations.cjs` opens every address of a running app, collects its explanations into one file to read against the source, and flags broken or shortened ones; it needs Playwright. `#debug` on, Esc off.

Part of [claude-skills](../../).
