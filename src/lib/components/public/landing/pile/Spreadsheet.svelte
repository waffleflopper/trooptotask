<script lang="ts">
	/** A cell by column (0 is A) and by row index into `rows` (0 is the header row). */
	interface Cell {
		col: number;
		row: number;
	}

	interface Props {
		/** Workbook name in the title bar. */
		file: string;
		/** Column widths in em, one per column from A. */
		widths: number[];
		/** Cell text by row. The first row is the tinted header row. */
		rows: string[][];
		/** The active cell, drawn with a thick outline. */
		selected: Cell;
		/** One cell under a red conditional format. */
		flagged?: Cell;
		/** Sheet tab names. The first is the open sheet. */
		tabs: string[];
		/** Yellow message bar under the ribbon; the workbook opens read-only. */
		banner?: string;
	}

	let { file, widths, rows, selected, flagged, tabs, banner }: Props = $props();

	const LETTERS = 'ABCDEFGH';
	/** Rows drawn under the column letters. Rows past the data stay empty, as in a real sheet. */
	const GRID_ROWS = 16;
	const ROW_NUMBERS = Array.from({ length: GRID_ROWS }, (_, i) => i + 1).join('\n');
	const NUMBERS_WIDTH = 2.4;

	// Each column is one text node, a line per row, laid over CSS gridlines.
	const columns = $derived(widths.map((_, col) => rows.map((row) => row[col] ?? '').join('\n')));
	const template = $derived([NUMBERS_WIDTH, ...widths].map((w) => `${w}em`).join(' '));
	const width = $derived(widths.reduce((sum, w) => sum + w, NUMBERS_WIDTH));
</script>

<div class="sheet" style:width="{width}em">
	<p class="title">{file}</p>
	<p class="ribbon">File Home Insert Draw Formulas Data Review View</p>
	{#if banner}
		<p class="banner">{banner}</p>
	{/if}
	<p class="formula">
		<span class="ref">{LETTERS[selected.col]}{selected.row + 1}</span><i>fx</i>{rows[selected.row][selected.col]}
	</p>
	<div class="grid" style:grid-template-columns={template} style:--rows={GRID_ROWS + 1}>
		<span class="numbers">{ROW_NUMBERS}</span>
		<!-- Explicit tracks: auto-placement would route full-height columns around the cell overlays. -->
		{#each columns as text, col (col)}
			<span class="column" style:grid-column={col + 2} data-col={LETTERS[col]}>{text}</span>
		{/each}
		{#if flagged}
			<span class="flagged" style:grid-area="{flagged.row + 2} / {flagged.col + 2}"
				>{rows[flagged.row][flagged.col]}</span
			>
		{/if}
		<span class="selected" style:grid-area="{selected.row + 2} / {selected.col + 2}"></span>
	</div>
	<p class="tabs">
		{#each tabs as tab, i (tab)}
			<span class={{ open: i === 0 }}>{tab}</span>
		{/each}
	</p>
</div>

<style>
	.sheet {
		--row: 1.55em;
		--line: var(--l-office-sheet-line);
		--chrome: oklch(93.5% 0.006 130);
		--chrome-ink: oklch(42% 0.012 130);
		overflow: hidden;
		border: 1px solid oklch(56% 0.05 155);
		background: var(--l-office-sheet);
		color: oklch(27% 0.012 130);
		font-family: var(--l-office-font);
		font-size: 0.75em;
		line-height: 1.5;
		white-space: nowrap;
	}

	.title {
		position: relative;
		overflow: hidden;
		padding: 0.3em 4.5em;
		background: var(--l-office-sheet-accent);
		color: var(--l-office-sheet);
		font-size: 1.2em;
		text-align: center;
		text-overflow: ellipsis;
	}

	/* Minimize, maximize, close. */
	.title::after {
		content: '\2013\2003\25A1\2003\00D7';
		position: absolute;
		right: 0.8em;
	}

	.ribbon {
		padding: 0.2em 0.8em;
		border-bottom: 1px solid var(--line);
		background: var(--chrome);
		color: var(--chrome-ink);
		word-spacing: 1.3em;
	}

	.banner {
		padding: 0.3em 0.8em;
		border-bottom: 1px solid oklch(80% 0.1 92);
		background: oklch(94% 0.08 95);
		color: oklch(30% 0.05 80);
		font-weight: 700;
	}

	.formula {
		display: flex;
		gap: 0.7em;
		border-bottom: 1px solid var(--line);
	}

	.ref {
		width: 4.6em;
		padding-inline: 0.4em;
		border-right: 1px solid var(--line);
	}

	.formula i {
		color: var(--chrome-ink);
	}

	.grid {
		display: grid;
		grid-template-rows: repeat(var(--rows), var(--row));
		line-height: var(--row);
		background:
			repeating-linear-gradient(transparent 0 calc(var(--row) - 1px), var(--line) 0 var(--row)),
			linear-gradient(var(--l-office-sheet-head) 0 0) 0 var(--row) / 100% var(--row) no-repeat;
	}

	.numbers,
	.column {
		position: relative;
		grid-row: 1 / -1;
		overflow: hidden;
		padding-top: var(--row);
		border-right: 1px solid var(--line);
		white-space: pre;
	}

	.numbers {
		grid-column: 1;
		background:
			repeating-linear-gradient(transparent 0 calc(var(--row) - 1px), var(--line) 0 var(--row)), var(--chrome);
		color: var(--chrome-ink);
		text-align: center;
	}

	.column {
		padding-inline: 0.3em;
	}

	/* The header row reads bold, like every tracker ever typed. */
	.column::first-line {
		font-weight: 700;
	}

	/* Column letters, and the blank corner above the row numbers (which has no letter). */
	.numbers::before,
	.column::before {
		content: attr(data-col);
		position: absolute;
		inset: 0 0 auto;
		height: var(--row);
		box-sizing: border-box;
		border-bottom: 1px solid var(--line);
		background: var(--chrome);
		color: var(--chrome-ink);
		text-align: center;
	}

	.flagged {
		overflow: hidden;
		padding-inline: 0.3em;
		border-right: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		background: oklch(88% 0.07 20);
		color: oklch(40% 0.16 25);
	}

	.selected {
		position: relative;
		margin: -1px;
		border: 2px solid var(--l-office-sheet-accent);
	}

	/* The fill handle. */
	.selected::after {
		content: '';
		position: absolute;
		right: -0.3em;
		bottom: -0.3em;
		width: 0.45em;
		height: 0.45em;
		border: 1px solid var(--l-office-sheet);
		background: var(--l-office-sheet-accent);
	}

	.tabs {
		display: flex;
		padding-left: 2.4em;
		border-top: 1px solid var(--line);
		background: var(--chrome);
		color: var(--chrome-ink);
	}

	.tabs span {
		padding: 0.1em 0.9em;
		border-right: 1px solid var(--line);
	}

	.tabs .open {
		border-bottom: 2px solid var(--l-office-sheet-accent);
		background: var(--l-office-sheet);
		color: var(--l-office-sheet-accent);
		font-weight: 700;
	}

	.tabs::after {
		content: '+';
		padding-inline: 0.8em;
	}
</style>
