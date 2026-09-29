<script lang="ts">
	import { days, groups, soldierCount } from './boardData';

	const label = `Availability board: ${soldierCount} Soldiers in two platoons across two weeks, color-coded by leave, school, TDY, appointment and field status`;
	const weekendColumns = days.flatMap((day, column) => (day.weekend ? [column] : []));
</script>

<!--
	The board's paper: header, weekend tint, group bands and grid. Names and status
	blocks are chips that land on it from the chip layer. Columns and groups beyond
	the frame's `--cols` / `--groups` fall outside the board and are clipped.
-->
<div class="board" role="img" aria-label={label}>
	{#each weekendColumns as column (column)}
		<span class="weekend" style:--col={column}></span>
	{/each}
	<div class="head">
		<span class="corner">Personnel</span>
		{#each days as day, column (column)}
			<span class={['day', column === 0 && 'day--today']}>
				{day.weekday}
				<b class="day__date l-figures">{day.date}</b>
			</span>
		{/each}
	</div>
	{#each groups as group (group.name)}
		<div class="band">{group.name}</div>
		<div class="rows" style:--count={group.soldiers.length}></div>
	{/each}
</div>

<style>
	.board {
		position: absolute;
		top: calc(var(--by-f) * 100cqh);
		left: var(--bx);
		width: var(--bw);
		height: calc(var(--bh-f) * 100cqh);
		overflow: clip;
		border-radius: 4px;
		background: var(--l-day);
		color: var(--l-ink);
	}

	/* The frame is drawn on top so it never shifts the grid the chips align to. */
	.board::after {
		content: '';
		position: absolute;
		inset: 0;
		border: 1px solid var(--l-day-line);
		border-radius: inherit;
		pointer-events: none;
	}

	.weekend {
		position: absolute;
		top: 0;
		bottom: 0;
		left: calc(var(--namew) + var(--col) * var(--colw));
		width: var(--colw);
		background: var(--l-day-sunk);
	}

	.head {
		position: relative;
		display: flex;
		height: calc(var(--head-f) * 100cqh);
		border-bottom: 1px solid var(--l-day-line);
	}

	.corner,
	.band,
	.day {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.625rem;
		font-weight: 500;
		line-height: 1;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.corner {
		flex: none;
		align-self: flex-end;
		width: var(--namew);
		padding: 0 0 0.6rem 0.75rem;
		color: var(--l-ink-muted);
	}

	.day {
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		gap: 0.15rem;
		width: var(--colw);
		padding-bottom: 0.4rem;
		border-left: 1px solid var(--l-day-line);
		font-size: 0.5625rem;
		letter-spacing: 0.08em;
		color: var(--l-ink-muted);
	}

	.day__date {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.125rem;
		font-weight: 700;
		letter-spacing: 0;
		color: var(--l-ink);
	}

	/* Today: the one amber mark inside the board. It sits in the cell's own stack, so it always clears the label. */
	.day--today::before {
		content: '';
		flex: none;
		width: 1rem;
		height: 2px;
		margin-bottom: 0.15rem;
		background: var(--l-amber);
	}

	.band {
		position: relative;
		display: flex;
		align-items: center;
		height: calc(var(--band-f) * 100cqh);
		padding-left: 0.75rem;
		background: var(--l-night);
		color: var(--l-night-text);
		letter-spacing: 0.14em;
	}

	/* Row hairlines across the full width, day columns from the name column on. */
	.rows {
		position: relative;
		height: calc(var(--count) * var(--row-f) * 100cqh);
		background: linear-gradient(to top, var(--l-day-line) 1px, transparent 1px) 0 0 / 100% calc(var(--row-f) * 100cqh);
	}

	.rows::before {
		content: '';
		position: absolute;
		inset: 0 0 0 var(--namew);
		background: linear-gradient(to right, var(--l-day-line) 1px, transparent 1px) 0 0 / var(--colw) 100%;
	}

	@media (max-width: 640px) {
		.day__date {
			font-size: 1rem;
		}
	}
</style>
