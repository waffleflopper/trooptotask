<script lang="ts">
	import Modal from './Modal.svelte';
	import { dashboardPrefsStore, type CardId } from '$lib/stores/dashboardPrefs.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	const cardLabels: Record<CardId, string> = {
		strength: "Today's Strength",
		duty: 'Duty Assignments',
		training: 'Training Status',
		upcoming: 'Upcoming Changes',
		ratings: 'Rating Scheme',
		onboardings: 'Active Onboardings',
		groups: 'Per-Group Breakdown'
	};
</script>

<Modal title="Customize Dashboard" {onClose} width="420px" titleId="customize-dashboard-title">
	<div class="customize-intro">
		<p class="customize-kicker">Layout Control</p>
		<p class="customize-copy">
			Hide modules you do not need and move the remaining ones into the order that best supports your daily brief.
		</p>
	</div>

	<div class="card-list">
		{#each dashboardPrefsStore.cardOrder as cardId, i (cardId)}
			<div class="card-row" class:hidden-card={!dashboardPrefsStore.isVisible(cardId)}>
				<div class="card-row-main">
					<span class="card-order">{String(i + 1).padStart(2, '0')}</span>

					<div class="card-meta">
						<span class="card-name">{cardLabels[cardId]}</span>
						<span class="card-state">{dashboardPrefsStore.isVisible(cardId) ? 'Visible' : 'Hidden'}</span>
					</div>
				</div>

				<div class="card-row-actions">
					<button
						class="visibility-btn"
						onclick={() => dashboardPrefsStore.toggleCard(cardId)}
						aria-label={dashboardPrefsStore.isVisible(cardId)
							? `Hide ${cardLabels[cardId]}`
							: `Show ${cardLabels[cardId]}`}
					>
						{#if dashboardPrefsStore.isVisible(cardId)}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
								<circle cx="12" cy="12" r="3" />
							</svg>
							Hide
						{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
								<path
									d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
								/>
								<line x1="1" y1="1" x2="23" y2="23" />
							</svg>
							Show
						{/if}
					</button>

					<div class="move-btns">
						<button
							class="move-btn"
							disabled={i === 0}
							onclick={() => dashboardPrefsStore.moveCard(cardId, 'up')}
							aria-label={`Move ${cardLabels[cardId]} up`}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
								<polyline points="18 15 12 9 6 15" />
							</svg>
						</button>
						<button
							class="move-btn"
							disabled={i === dashboardPrefsStore.cardOrder.length - 1}
							onclick={() => dashboardPrefsStore.moveCard(cardId, 'down')}
							aria-label={`Move ${cardLabels[cardId]} down`}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={() => dashboardPrefsStore.resetDefaults()}>Reset to Default</button>
		<div class="spacer"></div>
		<button class="btn btn-amber" onclick={onClose}>Done</button>
	{/snippet}
</Modal>

<style>
	.customize-intro {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		margin-bottom: var(--sp-4);
	}

	.customize-kicker {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--amber);
	}

	.customize-copy {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.card-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.card-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-4);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 86%, var(--surface-subtle) 14%);
		transition:
			border-color var(--transition-fast),
			background var(--transition-fast);
	}

	.card-row:hover {
		border-color: var(--ink-35);
	}

	.card-row.hidden-card {
		opacity: 0.72;
	}

	.card-row-main,
	.card-row-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.card-row-main {
		min-width: 0;
		flex: 1;
	}

	.card-order {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		color: var(--text-secondary);
		flex-shrink: 0;
	}

	.card-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.card-name {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.card-state {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.visibility-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 2rem;
		padding: 0 0.7rem;
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		cursor: pointer;
	}

	.visibility-btn:hover {
		color: var(--text-primary);
		background: var(--surface-subtle);
	}

	.move-btns {
		display: flex;
		gap: 4px;
	}

	.move-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		background: none;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		cursor: pointer;
		padding: 0;
	}

	.move-btn:hover:not(:disabled) {
		color: var(--text-primary);
		background: var(--surface-subtle);
	}

	.move-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.icon {
		width: 16px;
		height: 16px;
	}

	@media (max-width: 640px) {
		.card-row {
			flex-direction: column;
			align-items: stretch;
		}

		.card-row-actions {
			justify-content: space-between;
		}
	}
</style>
