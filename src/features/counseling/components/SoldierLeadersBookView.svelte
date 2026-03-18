<script lang="ts">
	import type { Personnel } from '$lib/types';
	import { page } from '$app/stores';
	import InfoSection from './sections/InfoSection.svelte';
	import StatusSection from './sections/StatusSection.svelte';
	import TrainingSection from './sections/TrainingSection.svelte';
	import CounselingsSection from './sections/CounselingsSection.svelte';
	import GoalsSection from './sections/GoalsSection.svelte';

	interface Props {
		person: Personnel;
		canEdit: boolean;
		onClose: () => void;
	}

	let { person, canEdit, onClose }: Props = $props();
	const orgId = $page.params.orgId!;
</script>

<div
	class="modal-overlay fullscreen"
	role="dialog"
	aria-modal="true"
	aria-labelledby="soldier-view-title"
	tabindex="-1"
	onkeydown={(e) => e.key === 'Escape' && onClose()}
>
	<div class="soldier-view">
		<header class="view-header">
			<div class="header-content">
				<button class="back-btn" onclick={onClose} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="19" y1="12" x2="5" y2="12" />
						<polyline points="12 19 5 12 12 5" />
					</svg>
				</button>
				<div class="person-header-info">
					<h1 id="soldier-view-title">
						<span class="rank">{person.rank}</span>
						{person.lastName}, {person.firstName}
					</h1>
					<div class="person-meta">
						{#if person.groupName}
							<span class="meta-item">{person.groupName}</span>
						{/if}
						{#if person.clinicRole}
							<span class="meta-item">{person.clinicRole}</span>
						{/if}
						{#if person.mos}
							<span class="meta-item">{person.mos}</span>
						{/if}
					</div>
				</div>
			</div>
		</header>

		<main class="view-content">
			<div class="dashboard-row top-row">
				<InfoSection {person} {canEdit} />
				<StatusSection {person} {canEdit} />
				<TrainingSection {person} {canEdit} {orgId} />
			</div>

			<div class="dashboard-row bottom-row">
				<CounselingsSection {person} {canEdit} />
				<GoalsSection {person} {canEdit} />
			</div>
		</main>
	</div>
</div>

<style>
	.modal-overlay.fullscreen {
		display: flex;
		align-items: stretch;
		justify-content: stretch;
		top: var(--header-height, 56px);
		z-index: 90;
	}

	.soldier-view {
		width: 100%;
		height: 100%;
		background: var(--color-bg);
		display: flex;
		flex-direction: column;
	}

	.view-header {
		background: #0f0f0f;
		color: #f0ede6;
		padding: var(--spacing-md) var(--spacing-lg);
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-full);
		background: rgba(255, 255, 255, 0.15);
		color: white;
		transition: all var(--transition-fast);
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.back-btn svg {
		width: 24px;
		height: 24px;
	}

	.person-header-info h1 {
		font-size: var(--font-size-xl);
		font-weight: 700;
		margin: 0;
	}

	.person-header-info h1 .rank {
		opacity: 0.9;
	}

	.person-meta {
		display: flex;
		gap: var(--spacing-md);
		margin-top: var(--spacing-xs);
		opacity: 0.9;
	}

	.meta-item {
		font-size: var(--font-size-sm);
	}

	.view-content {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.dashboard-row {
		display: grid;
		gap: var(--spacing-lg);
	}

	.top-row {
		grid-template-columns: repeat(3, 1fr);
	}

	.bottom-row {
		grid-template-columns: repeat(2, 1fr);
	}

	@media (max-width: 1024px) {
		.top-row {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 640px) {
		.view-header {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.person-header-info h1 {
			font-size: var(--font-size-lg);
		}

		.view-content {
			padding: var(--spacing-md);
		}

		.top-row,
		.bottom-row {
			grid-template-columns: 1fr;
		}
	}
</style>
