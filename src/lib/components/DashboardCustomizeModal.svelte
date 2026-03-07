<script lang="ts">
	import Modal from './Modal.svelte';
	import { dashboardPrefsStore, type CardId } from '$lib/stores/dashboardPrefs.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	const cardLabels: Record<CardId, string> = {
		strength: 'Today\'s Strength',
		duty: 'Duty Assignments',
		training: 'Training Status',
		upcoming: 'Upcoming Changes',
		ratings: 'Rating Scheme',
		onboardings: 'Active Onboardings',
		groups: 'Per-Group Breakdown'
	};
</script>

<Modal title="Customize Dashboard" {onClose} width="420px" titleId="customize-dashboard-title">
	<div class="card-list">
		{#each dashboardPrefsStore.cardOrder as cardId, i (cardId)}
			<div class="card-row" class:hidden-card={!dashboardPrefsStore.isVisible(cardId)}>
				<button
					class="visibility-btn"
					onclick={() => dashboardPrefsStore.toggleCard(cardId)}
					aria-label={dashboardPrefsStore.isVisible(cardId) ? `Hide ${cardLabels[cardId]}` : `Show ${cardLabels[cardId]}`}
				>
					{#if dashboardPrefsStore.isVisible(cardId)}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
							<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon">
							<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
							<line x1="1" y1="1" x2="23" y2="23" />
						</svg>
					{/if}
				</button>

				<span class="card-name">{cardLabels[cardId]}</span>

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
		{/each}
	</div>

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={() => dashboardPrefsStore.resetDefaults()}>Reset to Default</button>
		<div class="spacer"></div>
		<button class="btn btn-primary" onclick={onClose}>Done</button>
	{/snippet}
</Modal>

<style>
	.card-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.card-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-xs);
		border-radius: var(--radius-sm);
		transition: background var(--transition-fast);
	}

	.card-row:hover {
		background: var(--color-surface-variant);
	}

	.card-row.hidden-card {
		opacity: 0.5;
	}

	.card-name {
		flex: 1;
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text);
	}

	.visibility-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0;
	}

	.visibility-btn:hover {
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.move-btns {
		display: flex;
		gap: 2px;
	}

	.move-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0;
	}

	.move-btn:hover:not(:disabled) {
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.move-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.icon {
		width: 16px;
		height: 16px;
	}
</style>
