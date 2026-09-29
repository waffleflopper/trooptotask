<script lang="ts">
	/**
	 * A marker "name": arches and loops that read as handwriting at a glance and
	 * never as a real name. Each number is one letter's height.
	 */
	function scribble(x: number, y: number, letters: number[]): string {
		let d = `M${x} ${y}`;
		for (const h of letters) {
			d += h > 10 ? ` c5 ${-h} -4 ${-h} 1 0 c1 3 4 3 6 0` : ` c1 ${-h} 5 ${-h} 5 0 c0 2 2 2 3 0`;
		}
		return d;
	}

	const ROWS = [94, 116, 138, 160, 182, 204, 226];
	const NAME_SHAPES = [
		[18, 7, 7, 12, 7, 7],
		[18, 8, 14, 14, 7, 8],
		[18, 7, 8, 7, 7, 8],
		[16, 8, 14, 8, 7, 13, 7],
		[18, 7, 7, 8, 13],
		[18, 8, 7, 14, 7, 8, 7],
		[18, 7, 13, 7, 8]
	];
	const NAMES = ROWS.map((y, i) => scribble(24, y, NAME_SHAPES[i])).join(' ');
	const GHOSTS = [scribble(300, 146, [14, 7, 8, 7, 12, 7]), scribble(306, 226, [16, 7, 8, 13, 7])].join(' ');

	// Status codes in marker, one per row. The struck-through row is row five.
	const STATUS: [string, 'blue' | 'green'][] = [
		['LV', 'green'],
		['PDY', 'blue'],
		['APPT thu', 'blue'],
		['SCH ??', 'blue'],
		['PDY', 'blue'],
		['LV', 'green'],
		['TDY', 'blue']
	];

	const TALLY = [300, 332, 364]
		.flatMap((x, group) => {
			const strokes = group < 2 ? 4 : 3;
			const marks = Array.from({ length: strokes }, (_, i) => `M${x + i * 6} 82 l1 18`);
			return group < 2 ? [...marks, `M${x - 4} 97 l27 -12`] : marks;
		})
		.join(' ');
</script>

<svg class="whiteboard" viewBox="0 0 420 260">
	<rect class="face" x="3" y="3" width="414" height="238" rx="4" />
	<rect class="tray" x="50" y="243" width="320" height="9" rx="2" />
	<rect class="marker blue" x="96" y="238" width="34" height="6" rx="2" />
	<rect class="marker red" x="142" y="238" width="34" height="6" rx="2" />

	<path
		class="smudge"
		d="M292 130 C320 122 364 136 404 126 M296 206 C330 198 372 212 402 202 M158 208 C190 202 230 214 262 206"
	/>
	<path class="ghost blue" d={GHOSTS} />

	<text class="blue heading" x="18" y="32">1st PLT</text>
	<text class="blue note" x="112" y="31">wk of 13 JUL</text>
	<text class="blue" x="24" y="64">NAME</text>
	<text class="blue" x="152" y="64">STATUS</text>
	<text class="green" x="300" y="64">PT</text>

	<path
		class="blue line"
		d="M16 72 C90 69 180 75 276 70 M142 46 C140 110 145 170 141 236 M276 46 C278 120 273 180 276 236"
	/>
	<path class="blue" d={NAMES} />
	<text>
		{#each STATUS as [code, ink], i (i)}
			<tspan class={ink} x="152" y={ROWS[i]}>{code}</tspan>
		{/each}
	</text>
	<path class="green" d={TALLY} />

	<path
		class="red line"
		d="M20 177 C80 173 190 181 268 175 M334 160 c14 -12 40 -6 40 14 c0 18 -26 26 -38 12 c-8 -9 -4 -22 6 -26"
	/>
	<text class="red big" x="344" y="185">?</text>
</svg>

<style>
	.whiteboard {
		display: block;
		width: 38em;
		height: calc(38em * 260 / 420);
	}

	.face {
		fill: var(--l-office-board);
		stroke: oklch(79% 0.012 240);
		stroke-width: 5;
	}

	.tray {
		fill: oklch(72% 0.012 240);
	}

	.marker {
		fill: currentColor;
	}

	.blue {
		color: var(--l-office-marker-blue);
	}

	.green {
		color: var(--l-office-marker-green);
	}

	.red {
		color: var(--l-office-marker-red);
	}

	path {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.line {
		stroke-width: 2.6;
	}

	/* Last week's board, not quite erased. */
	.smudge {
		stroke: oklch(92% 0.01 240);
		stroke-width: 18;
	}

	.ghost {
		opacity: 0.14;
	}

	text {
		fill: currentColor;
		font-family: var(--l-office-hand);
		font-size: 15px;
		font-weight: 700;
	}

	.heading {
		font-size: 24px;
	}

	.note {
		font-size: 14px;
		font-weight: 400;
	}

	.big {
		font-size: 30px;
	}
</style>
