<script lang="ts">
	import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
	import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import {
		getProgress,
		formatTimestamp,
		getPersonDisplayName,
		getPersonGroupDisplayName,
		getTemplateDisplayName,
		STEP_TYPE_LABELS
	} from '$features/onboarding/contexts/OnboardingPageContext.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let { data } = $props();

	let expandedOnboardingId = $state<string | null>(null);
	const expandedNotes = new SvelteSet<string>();

	const historyOnboardings = $derived(
		onboardingStore.items.filter((o) => o.status === 'completed' || o.status === 'cancelled')
	);
	const completedCount = $derived(historyOnboardings.filter((item) => item.status === 'completed').length);
	const cancelledCount = $derived(historyOnboardings.filter((item) => item.status === 'cancelled').length);

	function toggleExpand(id: string) {
		expandedOnboardingId = expandedOnboardingId === id ? null : id;
	}

	function toggleNotes(stepId: string) {
		if (expandedNotes.has(stepId)) expandedNotes.delete(stepId);
		else expandedNotes.add(stepId);
	}
</script>

<svelte:head>
	<title>Onboarding History - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar
		title="Onboarding History"
		helpTopic="onboarding"
		breadcrumbs={[{ label: 'Onboarding', href: `/org/${data.orgId}/onboarding` }, { label: 'History' }]}
	>
		<a href={`/org/${data.orgId}/onboarding`} class="btn btn-sm" data-quiet-button>Back</a>
	</PageToolbar>

	<main class="page-content">
		<div class="history-summary">
			<div class="summary-card">
				<span class="summary-label">Archived</span>
				<strong class="summary-value">{historyOnboardings.length}</strong>
				<span class="summary-meta">Completed or cancelled onboarding records</span>
			</div>
			<div class="summary-card">
				<span class="summary-label">Completed</span>
				<strong class="summary-value">{completedCount}</strong>
				<span class="summary-meta">Packets closed successfully</span>
			</div>
			<div class="summary-card">
				<span class="summary-label">Cancelled</span>
				<strong class="summary-value">{cancelledCount}</strong>
				<span class="summary-meta">Packets stopped before completion</span>
			</div>
		</div>

		{#if historyOnboardings.length === 0}
			<EmptyState message="No completed or cancelled onboardings yet." />
		{:else}
			<div class="onboarding-list">
				{#each historyOnboardings as onboarding (onboarding.id)}
					{@const progress = getProgress(onboarding)}
					{@const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0}
					{@const isExpanded = expandedOnboardingId === onboarding.id}
					{@const groupName = getPersonGroupDisplayName(onboarding.personnelId, personnelStore.items)}
					<div class="onboarding-card" class:expanded={isExpanded}>
						<button
							class="card-summary"
							type="button"
							onclick={() => toggleExpand(onboarding.id)}
							aria-expanded={isExpanded}
						>
							<div class="card-main">
								<span class="expand-icon">{isExpanded ? '▼' : '▶'}</span>
								<div class="card-info">
									<span class="person-name">{getPersonDisplayName(onboarding.personnelId, personnelStore.items)}</span>
									<div class="card-meta">
										<span class="template-name"
											>{getTemplateDisplayName(onboarding.templateId, onboardingTemplateStore.templates)}</span
										>
										{#if groupName}
											<span class="meta-sep">·</span>
											<span>{groupName}</span>
										{/if}
										<span class="meta-sep">·</span>
										<span>Started {formatDisplayDate(onboarding.startedAt)}</span>
										{#if onboarding.completedAt}
											<span class="meta-sep">·</span>
											<span>Completed {formatDisplayDate(onboarding.completedAt)}</span>
										{/if}
										{#if onboarding.cancelledAt}
											<span class="meta-sep">·</span>
											<span>Cancelled {formatDisplayDate(onboarding.cancelledAt)}</span>
										{/if}
									</div>
								</div>
							</div>
							<div class="card-progress">
								<span class="summary-label">Final Progress</span>
								<div class="progress-bar">
									<div class="progress-fill" class:progress-complete={pct === 100} style="width: {pct}%"></div>
								</div>
								<span class="progress-text">{progress.completed}/{progress.total} complete</span>
							</div>
							<div class="card-status">
								<Badge
									label={onboarding.status === 'completed' ? 'Completed' : 'Cancelled'}
									color={onboarding.status === 'completed' ? 'var(--success)' : 'var(--text-secondary)'}
								/>
							</div>
						</button>

						{#if isExpanded}
							<div class="card-detail">
								<div class="step-list">
									{#each onboarding.steps as step (step.id)}
										{@const isInactive = !step.active}
										<div class="step-row" class:step-complete={step.completed} class:step-inactive={isInactive}>
											<div class="step-main">
												{#if isInactive}
													<span class="step-type-indicator step-type-inactive">removed</span>
												{:else}
													<span class="step-type-indicator step-type-{step.stepType}"
														>{STEP_TYPE_LABELS[step.stepType]}</span
													>
												{/if}
												<span class="step-name">{step.stepName}</span>

												{#if isInactive}
													<span class="inactive-note"
														>{step.completed ? 'Previously completed' : 'Removed from template'}</span
													>
												{:else}
													<div class="step-status">
														{#if step.stepType === 'checkbox' || step.stepType === 'training'}
															<span class="status-icon" class:complete={step.completed}
																>{step.completed ? '✓' : '—'}</span
															>
														{:else if step.stepType === 'paperwork'}
															<div class="stage-indicator">
																<Stepper
																	stages={step.stages ?? []}
																	currentStage={step.currentStage ?? (step.stages ?? [])[0] ?? ''}
																	disabled={true}
																/>
															</div>
														{/if}
													</div>
												{/if}
											</div>

											{#if !isInactive && step.notes.length > 0}
												<button
													class="notes-toggle"
													type="button"
													onclick={() => toggleNotes(step.id)}
													aria-label="Toggle notes"
												>
													<svg
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														class="notes-icon"
													>
														<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
													</svg>
													<span class="notes-count">{step.notes.length}</span>
												</button>

												{#if expandedNotes.has(step.id)}
													<div class="step-notes">
														<div class="notes-list">
															{#each step.notes as note, noteIndex (`${note.timestamp}:${note.userId}:${note.text}:${noteIndex}`)}
																<div class="note-item">
																	<span class="note-text">{note.text}</span>
																	<span class="note-time">{formatTimestamp(note.timestamp)}</span>
																</div>
															{/each}
														</div>
													</div>
												{/if}
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--surface-page);
	}

	[data-quiet-button] {
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
	}

	.history-summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}

	.summary-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-subtle) 8%);
	}

	.summary-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.summary-value {
		font-family: var(--font-display);
		font-size: clamp(1.45rem, 1.2rem + 0.5vw, 2rem);
		font-weight: var(--font-weight-display);
		line-height: 0.95;
		color: var(--text-primary);
	}

	.summary-meta {
		font-size: var(--text-sm);
		line-height: 1.45;
		color: var(--text-secondary);
	}

	.onboarding-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.onboarding-card {
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		overflow: hidden;
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.onboarding-card:hover {
		box-shadow: var(--shadow-sm);
	}

	.onboarding-card.expanded {
		border-color: var(--amber-dark);
	}

	.card-summary {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface-panel);
		border: none;
		cursor: pointer;
		text-align: left;
		color: var(--text-primary);
	}

	.card-summary:hover {
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.card-main {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex: 1;
		min-width: 0;
	}

	.expand-icon {
		width: 14px;
		font-size: 10px;
		flex-shrink: 0;
		color: var(--text-tertiary);
	}

	.card-info {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		min-width: 0;
	}

	.person-name {
		font-size: var(--text-lg);
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta-sep {
		opacity: 0.5;
	}

	.template-name {
		color: var(--amber-dark);
	}

	.card-progress {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-1);
		flex-shrink: 0;
		min-width: 168px;
	}

	.progress-bar {
		width: 100%;
		height: 6px;
		background: var(--surface-subtle);
		border-radius: 999px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		border-radius: 999px;
		background: var(--amber-dark);
		transition: width 0.3s ease;
	}

	.progress-fill.progress-complete {
		background: var(--success);
	}

	.progress-text {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.card-detail {
		padding: var(--sp-4);
		border-top: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 42%, var(--surface-panel) 58%);
	}

	.step-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.step-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.step-row.step-complete {
		opacity: 0.62;
	}

	.step-row.step-inactive {
		opacity: 0.56;
		background: color-mix(in srgb, var(--surface-subtle) 76%, var(--surface-panel) 24%);
	}

	.step-main {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex: 1;
		min-width: 0;
	}

	.step-type-indicator {
		flex-shrink: 0;
		padding: 3px 6px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.step-type-checkbox {
		color: var(--text-secondary);
		background: var(--surface-subtle);
	}

	.step-type-paperwork {
		color: var(--amber-dark);
		background: color-mix(in srgb, var(--amber-light) 86%, var(--surface-panel) 14%);
	}

	.step-type-training {
		color: var(--info);
		background: color-mix(in srgb, var(--info-bg) 84%, var(--surface-panel) 16%);
	}

	.step-type-inactive {
		color: var(--text-tertiary);
		background: var(--surface-subtle);
		font-style: italic;
		text-transform: none;
	}

	.step-name {
		font-size: var(--text-sm);
		font-weight: 500;
		line-height: 1.35;
		color: var(--text-primary);
	}

	.inactive-note {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		font-style: italic;
	}

	.step-status {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-left: auto;
	}

	.status-icon {
		font-size: var(--text-base);
		font-weight: 700;
		color: var(--text-tertiary);
	}

	.status-icon.complete {
		color: var(--success);
	}

	.notes-toggle {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: var(--sp-1);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-tertiary);
		cursor: pointer;
	}

	.notes-toggle:hover {
		background: var(--surface-subtle);
	}

	.notes-icon {
		width: 16px;
		height: 16px;
	}

	.notes-count {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--amber-dark);
	}

	.step-notes {
		width: 100%;
		margin-top: var(--sp-2);
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 48%, var(--surface-panel) 52%);
	}

	.notes-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		max-height: 220px;
		overflow-y: auto;
	}

	.note-item {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--sp-2);
		padding: var(--sp-2) 0;
		border-bottom: var(--border-rule);
	}

	.note-item:last-child {
		border-bottom: none;
	}

	.note-text {
		flex: 1;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--text-primary);
	}

	.note-time {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
		white-space: nowrap;
	}

	@media (max-width: 820px) {
		.card-summary {
			flex-wrap: wrap;
			align-items: flex-start;
		}

		.card-progress {
			align-items: flex-start;
			width: 100%;
			min-width: 0;
		}

		.card-status {
			margin-left: auto;
		}
	}

	@media (max-width: 640px) {
		.history-summary {
			grid-template-columns: 1fr;
		}

		.card-summary,
		.card-detail {
			padding: var(--sp-3);
		}

		.card-meta {
			flex-wrap: wrap;
			white-space: normal;
		}

		.step-main,
		.step-status {
			flex-wrap: wrap;
			width: 100%;
			margin-left: 0;
		}
	}
</style>
