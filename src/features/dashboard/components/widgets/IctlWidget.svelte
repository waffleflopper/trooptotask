<script lang="ts">
	import WidgetShell from './WidgetShell.svelte';
	interface Props {
		configureMode?: boolean;
	}

	let { configureMode = false }: Props = $props();
</script>

<WidgetShell label="Critical Tasks" {configureMode}>
	<div class="placeholder-body">
		<div class="placeholder-icon" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
				<path d="M9 11l3 3L22 4" stroke-linecap="round" stroke-linejoin="round" />
				<path
					d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</div>
		<p class="placeholder-title">Critical Tasks</p>
		<p class="placeholder-desc">
			Unit ICTL proficiency snapshot — expired and expiring task completions across your formation. Coming with the
			Critical Tasks feature.
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
