<script lang="ts">
	interface Props {
		/** Day label, such as `Sun`. */
		day: string;
		/** Four 24-hour digits, such as `2214`. */
		time: string;
		tone: 'night' | 'day';
	}

	let { day, time, tone }: Props = $props();
</script>

<!-- Night and day clocks share one position, so the rising line wipes one time into the other. -->
<div class={['clock', tone]} aria-hidden="true">
	<span class="clock__day">{day}</span>
	<span class="clock__time l-figures">{time}</span>
</div>

<style>
	.clock {
		position: absolute;
		top: calc(var(--nav-h) + 1.25rem);
		right: var(--x0);
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.3rem;
	}

	.clock__day {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		line-height: 1;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.clock__time {
		font-family: 'Barlow Condensed', sans-serif;
		/* Capped by frame height so short frames keep the clock clear of the board. */
		font-size: clamp(2rem, min(4.2vw, 7cqh), 3.75rem);
		font-weight: 600;
		line-height: 0.85;
		letter-spacing: 0.01em;
	}

	.night {
		color: var(--l-night-text);
	}

	.night .clock__day {
		color: var(--l-night-muted);
	}

	.day {
		color: var(--l-ink);
	}

	.day .clock__day {
		color: var(--l-ink-muted);
	}
</style>
