<script lang="ts">
	import WidgetShell from './WidgetShell.svelte';
	interface Props {
		configureMode?: boolean;
	}

	let { configureMode = false }: Props = $props();
</script>

<WidgetShell label="Upcoming Losses" {configureMode}>
	<div class="placeholder-body">
		<div class="placeholder-icon" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
				<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke-linecap="round" stroke-linejoin="round" />
				<circle cx="9" cy="7" r="4" stroke-linecap="round" stroke-linejoin="round" />
				<path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke-linecap="round" stroke-linejoin="round" />
				<path d="M16 3.13a4 4 0 0 1 0 7.75" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</div>
		<p class="placeholder-title">Upcoming Losses</p>
		<p class="placeholder-desc">
			ETS and PCS departure dates within a configurable window. Coming when personnel separation dates are added.
		</p>
		<span class="placeholder-tag">Planned feature</span>
	</div>
</WidgetShell>

<style>
	.placeholder-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: var(--sp-2);
		padding: var(--sp-4);
	}

	.placeholder-icon {
		width: 32px;
		height: 32px;
		color: var(--ink-15);
		margin-bottom: var(--sp-1);
	}

	.placeholder-icon svg {
		width: 100%;
		height: 100%;
	}

	.placeholder-title {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-display);
		color: var(--ink-35);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.placeholder-desc {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--ink-35);
		margin: 0;
		max-width: 52ch;
		line-height: 1.6;
	}

	.placeholder-tag {
		display: inline-flex;
		margin-top: var(--sp-1);
		padding: 2px var(--sp-2);
		border: 1px solid var(--ink-15);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-35);
	}
</style>
