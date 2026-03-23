<script lang="ts">
	import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
	import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import {
		getProgress,
		formatTimestamp,
		STEP_TYPE_LABELS
	} from '$features/onboarding/contexts/OnboardingPageContext.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';

	let { data } = $props();

	let expandedOnboardingId = $state<string | null>(null);
	let expandedNotes = $state<Set<string>>(new Set());

	const historyOnboardings = $derived(
		onboardingStore.items.filter((o) => o.status === 'completed' || o.status === 'cancelled')
	);

	function getPersonName(personnelId: string): string {
		const p = personnelStore.getById(personnelId);
		return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
	}

	function getPersonGroupName(personnelId: string): string | null {
		const p = personnelStore.getById(personnelId);
		return p?.groupName || null;
	}

	function getTemplateName(templateId: string | null): string {
		if (!templateId) return 'No template';
		const tmpl = onboardingTemplateStore.templates.find((t) => t.id === templateId);
		return tmpl?.name ?? 'Template deleted';
	}

	function toggleExpand(id: string) {
		expandedOnboardingId = expandedOnboardingId === id ? null : id;
	}

	function toggleNotes(stepId: string) {
		const newSet = new Set(expandedNotes);
		if (newSet.has(stepId)) newSet.delete(stepId);
		else newSet.add(stepId);
		expandedNotes = newSet;
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
		<a href={`/org/${data.orgId}/onboarding`} class="btn-ghost">Back</a>
	</PageToolbar>

	<main class="page-content">
		{#if historyOnboardings.length === 0}
			<EmptyState message="No completed or cancelled onboardings yet." />
		{:else}
			<div class="onboarding-list">
				{#each historyOnboardings as onboarding (onboarding.id)}
					{@const progress = getProgress(onboarding)}
					{@const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0}
					{@const isExpanded = expandedOnboardingId === onboarding.id}
					{@const groupName = getPersonGroupName(onboarding.personnelId)}
					<div class="onboarding-card" class:expanded={isExpanded}>
						<button class="card-summary" onclick={() => toggleExpand(onboarding.id)} aria-expanded={isExpanded}>
							<div class="card-main">
								<span class="expand-icon">{isExpanded ? '▼' : '▶'}</span>
								<div class="card-info">
									<span class="person-name">{getPersonName(onboarding.personnelId)}</span>
									<div class="card-meta">
										<span class="template-name">{getTemplateName(onboarding.templateId)}</span>
										{#if groupName}
											<span class="meta-sep">·</span>
											<span class="group-name">{groupName}</span>
										{/if}
										<span class="meta-sep">·</span>
										<span class="date-info">Started {formatDisplayDate(onboarding.startedAt)}</span>
										{#if onboarding.completedAt}
											<span class="meta-sep">·</span>
											<span class="date-info">Completed {formatDisplayDate(onboarding.completedAt)}</span>
										{/if}
										{#if onboarding.cancelledAt}
											<span class="meta-sep">·</span>
											<span class="date-info">Cancelled {formatDisplayDate(onboarding.cancelledAt)}</span>
										{/if}
									</div>
								</div>
							</div>
							<div class="card-progress">
								<div class="progress-bar">
									<div class="progress-fill" class:progress-complete={pct === 100} style="width: {pct}%"></div>
								</div>
								<span class="progress-text">{progress.completed}/{progress.total}</span>
							</div>
							<div class="card-status">
								<Badge
									label={onboarding.status === 'completed' ? 'Completed' : 'Cancelled'}
									color={onboarding.status === 'completed' ? 'var(--color-success)' : 'var(--color-text-muted)'}
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
													<span class="inactive-note">
														{step.completed ? 'Previously completed' : 'Removed from template'}
													</span>
												{:else}
													<div class="step-status">
														{#if step.stepType === 'checkbox' || step.stepType === 'training'}
															<span class="status-icon" class:complete={step.completed}>
																{step.completed ? '✓' : '—'}
															</span>
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
												<button class="notes-toggle" onclick={() => toggleNotes(step.id)} aria-label="Toggle notes">
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
															{#each step.notes as note}
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
	.btn-ghost {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: 500;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s;
		text-decoration: none;
	}

	.btn-ghost:hover {
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.onboarding-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.onboarding-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		transition: box-shadow 0.15s ease;
	}

	.onboarding-card:hover {
		box-shadow: var(--shadow-2);
	}

	.onboarding-card.expanded {
		border-color: var(--color-primary);
	}

	.card-summary {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		width: 100%;
		padding: var(--spacing-md) var(--spacing-lg);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		color: var(--color-text);
	}

	.card-summary:hover {
		background: var(--color-hover);
	}

	.card-main {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex: 1;
		min-width: 0;
	}

	.expand-icon {
		font-size: 10px;
		width: 14px;
		flex-shrink: 0;
		color: var(--color-text-muted);
	}

	.card-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.person-name {
		font-weight: 600;
		font-size: var(--font-size-base);
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta-sep {
		color: var(--color-text-muted);
		opacity: 0.5;
	}

	.template-name,
	.group-name {
		color: var(--color-text-secondary);
	}

	.date-info {
		font-family: var(--font-mono);
	}

	.card-progress {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-shrink: 0;
		min-width: 140px;
	}

	.progress-bar {
		flex: 1;
		height: 6px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		border-radius: var(--radius-full);
		transition: width 0.3s ease;
		background: var(--color-primary);
	}

	.progress-fill.progress-complete {
		background: var(--color-success);
	}

	.progress-text {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.card-status {
		flex-shrink: 0;
	}

	.card-detail {
		border-top: 1px solid var(--color-divider);
		padding: var(--spacing-md) var(--spacing-lg);
	}

	.step-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.step-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		transition: opacity 0.15s ease;
	}

	.step-row.step-complete {
		opacity: 0.6;
	}

	.step-row.step-inactive {
		opacity: 0.5;
		background: var(--color-surface-variant);
	}

	.step-main {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex: 1;
		min-width: 0;
	}

	.step-type-indicator {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 2px var(--spacing-xs);
		border-radius: var(--radius-sm);
		flex-shrink: 0;
	}

	.step-type-checkbox {
		color: var(--color-text-muted);
		background: var(--color-surface-variant);
	}

	.step-type-paperwork {
		color: var(--color-warning, #f59e0b);
		background: var(--color-warning-bg, rgba(245, 158, 11, 0.1));
	}

	.step-type-training {
		color: var(--color-info);
		background: var(--color-info-bg, rgba(59, 130, 246, 0.1));
	}

	.step-type-inactive {
		color: var(--color-text-muted);
		background: var(--color-surface-variant);
		font-style: italic;
		text-transform: none;
	}

	.step-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.inactive-note {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-style: italic;
	}

	.step-status {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		margin-left: auto;
		flex-shrink: 0;
	}

	.status-icon {
		font-size: var(--font-size-base);
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.status-icon.complete {
		color: var(--color-success);
	}

	.stage-indicator {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.notes-toggle {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: var(--spacing-xs);
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.notes-toggle:hover {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.notes-icon {
		width: 16px;
		height: 16px;
	}

	.notes-count {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		font-weight: 600;
		color: var(--color-primary);
	}

	.step-notes {
		width: 100%;
		margin-top: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-divider);
	}

	.notes-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		max-height: 200px;
		overflow-y: auto;
	}

	.note-item {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) 0;
		border-bottom: 1px solid var(--color-divider);
	}

	.note-item:last-child {
		border-bottom: none;
	}

	.note-text {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		flex: 1;
		line-height: 1.4;
	}

	.note-time {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.card-summary {
			flex-wrap: wrap;
			padding: var(--spacing-sm) var(--spacing-md);
			gap: var(--spacing-sm);
		}

		.card-main {
			width: 100%;
		}

		.card-progress {
			min-width: 0;
			flex: 1;
		}

		.card-detail {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.step-main {
			flex-wrap: wrap;
		}

		.stage-indicator {
			width: 100%;
			margin-top: var(--spacing-xs);
		}
	}
</style>
