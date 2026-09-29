<script lang="ts">
	interface Props {
		/** `personnel` is a pasted status table someone has already marked up; `readiness` is a pasted grey block and 8px text. */
		kind: 'personnel' | 'readiness';
	}

	let { kind }: Props = $props();

	// Columns of the pasted table, one text node each. The numbers add up; the date is three weeks old.
	const PERSTAT = [
		'Unit\nHQ\n1 PLT\n2 PLT\n3 PLT\nTotal',
		'Asgd\n12\n31\n29\n30\n102',
		'PDY\n10\n26\n23\n27\n86',
		'LV\n1\n3\n2\n2\n8',
		'TDY\n1\n2\n4\n1\n8',
		'%\n83\n84\n79\n90\n84'
	];

	const READINESS = [
		'ACFT: 81% (as of 2 JUN)',
		'M4 qual: see tracker',
		'CBRN: 2 overdue, 1 TBD',
		'SHARP: 100%?',
		'BLS: pending roster from S3',
		"Driver's: ask 1SG"
	]
		.map((line) => `• ${line}`)
		.join('\n');
</script>

<div class="slide">
	{#if kind === 'personnel'}
		<p class="title">Personnel status</p>
		<p class="stamp">As of 19 Jun</p>
		<div class="table">
			{#each PERSTAT as column, i (i)}
				<span>{column}</span>
			{/each}
		</div>
		<span class="arrow"></span>
		<p class="count">Slide 14 of 31</p>
	{:else}
		<p class="title">Training readiness: update</p>
		<span class="pasted"></span>
		<p class="fine">{READINESS}</p>
		<p class="count">Slide 15 of 31</p>
	{/if}
</div>

<style>
	.slide {
		/* The default template's blue, not orange: nothing in the pile may read as the amber signal. */
		--rule: oklch(52% 0.13 255);
		position: relative;
		width: 27em;
		aspect-ratio: 16 / 9;
		box-sizing: border-box;
		padding: 1.1em 1.5em;
		border: 1px solid oklch(80% 0.01 250);
		background: oklch(98.5% 0.003 250);
		color: oklch(26% 0.03 255);
		font-family: var(--l-office-font);
		line-height: 1.2;
	}

	.title {
		padding-bottom: 0.3em;
		border-bottom: 0.15em solid var(--rule);
		font-size: 1.45em;
		font-weight: 700;
		text-transform: uppercase;
	}

	.stamp {
		margin-top: 0.4em;
		color: oklch(50% 0.02 255);
		font-size: 0.7em;
		text-transform: uppercase;
	}

	.table {
		--cell: 1.45em;
		display: grid;
		grid-template-columns: 1.6fr repeat(5, 1fr);
		width: 72%;
		margin-top: 0.5em;
		font-size: 0.72em;
		line-height: var(--cell);
		white-space: pre;
		background:
			linear-gradient(oklch(52% 0.13 255) 0 0) 0 0 / 100% var(--cell) no-repeat,
			repeating-linear-gradient(oklch(91% 0.03 255) 0 var(--cell), oklch(96% 0.012 255) 0 calc(2 * var(--cell)));
	}

	.table span {
		padding-inline: 0.5em;
		border-right: 1px solid oklch(99% 0.003 255);
		text-align: center;
	}

	.table span:first-child {
		text-align: left;
	}

	/* The header row of the pasted table. */
	.table span::first-line {
		color: oklch(98.5% 0.003 255);
		font-weight: 700;
	}

	/* Somebody's block arrow, pointing at the number that is already wrong. */
	.arrow {
		position: absolute;
		top: 51%;
		right: 3%;
		width: 7.5em;
		height: 2.4em;
		background: oklch(55% 0.21 27);
		clip-path: polygon(0 32%, 64% 32%, 64% 0, 100% 50%, 64% 100%, 64% 68%, 0 68%);
		transform: rotate(168deg);
	}

	.count {
		position: absolute;
		right: 1.5em;
		bottom: 0.7em;
		color: oklch(50% 0.02 255);
		font-size: 0.62em;
	}

	.pasted {
		position: absolute;
		top: 30%;
		left: 1.5em;
		width: 46%;
		height: 54%;
		border: 1px solid oklch(70% 0.005 250);
		background:
			repeating-linear-gradient(90deg, transparent 0 2.2em, oklch(76% 0.005 250) 0 calc(2.2em + 1px)),
			repeating-linear-gradient(transparent 0 0.9em, oklch(76% 0.005 250) 0 calc(0.9em + 1px)), oklch(83% 0.005 250);
	}

	/* 8px text, the house style of every stale slide. */
	.fine {
		position: absolute;
		top: 30%;
		left: 57%;
		right: 1em;
		font-size: 0.7em;
		line-height: 1.45;
		white-space: pre-line;
	}
</style>
