<!-- A group text at 0156. Bubbles land one after another from the slot's `--in`. -->
<div class="thread">
	<p class="stamp">Today 1:56 AM</p>
	<p class="bubble in">is Navarro back from leave or still out</p>
	<p class="bubble out">check the tracker</p>
	<p class="bubble in">which one</p>
</div>

<style>
	.thread {
		display: flex;
		flex-direction: column;
		gap: 0.35em;
		width: 17em;
		font-family: var(--l-office-font);
		font-size: 0.95em;
		line-height: 1.3;
	}

	.stamp {
		align-self: center;
		color: oklch(80% 0.01 250);
		font-size: 0.8em;
	}

	.bubble {
		--k: 0;
		--t: clamp(0, calc((var(--p) - var(--in) - var(--k) * 0.02) / 0.015), 1);
		max-width: 78%;
		padding: 0.45em 0.8em;
		border-radius: 1.1em;
		opacity: var(--t);
		transform: translateY(calc((1 - var(--t)) * 0.8em));
	}

	.in {
		align-self: flex-start;
		background: oklch(90% 0.006 250);
		color: oklch(24% 0.01 250);
	}

	.out {
		--k: 1;
		align-self: flex-end;
		background: oklch(58% 0.17 255);
		color: oklch(98% 0.005 255);
	}

	.bubble:last-child {
		--k: 2;
	}
</style>
