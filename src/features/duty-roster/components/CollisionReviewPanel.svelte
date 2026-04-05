<script lang="ts">
	interface Props {
		messages: string[];
		confirmed: boolean;
		onConfirmedChange: (confirmed: boolean) => void;
		applyLabel?: string;
	}

	let { messages, confirmed, onConfirmedChange, applyLabel = 'applying the run' }: Props = $props();
</script>

<section class="collision-review-panel" aria-label="Collision review">
	<div>
		<p class="eyebrow">Collision review required</p>
		<h5>Review these conflicts before {applyLabel}.</h5>
	</div>
	<div class="collision-list">
		{#each messages as conflict (conflict)}
			<p class="collision-item">{conflict}</p>
		{/each}
	</div>
	<label class="collision-checkbox">
		<input
			type="checkbox"
			checked={confirmed}
			onchange={(e) => onConfirmedChange((e.currentTarget as HTMLInputElement).checked)}
			aria-label={`I reviewed the conflicts for ${applyLabel}`}
		/>
		<span>I reviewed the conflicts</span>
	</label>
</section>

<style>
	.collision-review-panel {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: 1px solid color-mix(in srgb, var(--border-danger) 55%, var(--border-default));
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--surface-panel) 82%, var(--danger-light) 18%);
	}

	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	h5 {
		margin: 0;
	}

	.collision-list {
		display: grid;
		gap: var(--sp-2);
	}

	.collision-item {
		margin: 0;
		color: var(--text-primary);
	}

	.collision-checkbox {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		color: var(--text-primary);
	}
</style>
