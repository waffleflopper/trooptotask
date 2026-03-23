<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import {
		STEP_TYPE_COLORS,
		STEP_TYPE_LABELS,
		STATUS_COLORS,
		STATUS_LABELS,
		MODAL_IDS
	} from '../contexts/OnboardingPageContext.svelte';
	import { onboardingStore } from '../stores/onboarding.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';

	interface Props {
		ctx: OnboardingPageContext;
	}

	let { ctx }: Props = $props();
</script>

<svelte:head>
	<title>Onboarding - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Onboarding" helpTopic="onboarding" overflowItems={ctx.overflowItems}>
		<div class="filter-toggle">
			<button class="filter-btn" class:active={ctx.showFilter === 'active'} onclick={() => (ctx.showFilter = 'active')}>
				Active
			</button>
			<button class="filter-btn" class:active={ctx.showFilter === 'all'} onclick={() => (ctx.showFilter = 'all')}>
				All
			</button>
		</div>
		{#if ctx.canEditOnboarding}
			{#if ctx.canManageConfig}
				<button class="btn-ghost" onclick={() => ctx.modals.open(MODAL_IDS.templateManager)} disabled={ctx.readOnly}>
					Manage Templates
				</button>
			{/if}
			<button
				class="btn btn-primary btn-sm"
				onclick={() => ctx.modals.open(MODAL_IDS.startOnboarding)}
				disabled={!ctx.hasTemplateSteps || ctx.readOnly}
				title={!ctx.hasTemplateSteps ? 'Set up template steps before starting an onboarding' : ''}
			>
				Start Onboarding
			</button>
			{#if ctx.readOnly}
				<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
			{/if}
		{/if}
	</PageToolbar>

	{#if !ctx.canViewOnboarding}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content">
			{#if !ctx.hasTemplateSteps && onboardingStore.items.length > 0}
				<div class="warning-banner">
					<span>No template steps defined — new onboardings cannot be started until steps are added.</span>
					{#if ctx.canEditOnboarding}
						<button class="btn btn-sm btn-secondary" onclick={() => ctx.modals.open(MODAL_IDS.templateManager)}>
							Manage Templates
						</button>
					{/if}
				</div>
			{/if}

			{#if ctx.resyncError}
				<div class="error-banner">
					<span>{ctx.resyncError}</span>
					<button class="btn btn-sm btn-secondary" onclick={() => (ctx.resyncError = null)}>Dismiss</button>
				</div>
			{/if}

			{#if ctx.filteredOnboardings.length === 0}
				{#if !ctx.hasTemplateSteps && onboardingStore.items.length === 0}
					{#if ctx.canEditOnboarding}
						<EmptyState
							message="Set up your onboarding template to get started. Define the steps new members need to complete."
							actionLabel="Set Up Template"
							onAction={() => ctx.modals.open(MODAL_IDS.templateManager)}
						/>
					{:else}
						<EmptyState message="Onboarding has not been configured yet." />
					{/if}
				{:else}
					<EmptyState
						message={ctx.showFilter === 'active'
							? 'No active onboardings. Start one to begin tracking a new member.'
							: 'No onboardings found.'}
					/>
				{/if}
			{:else}
				<div class="onboarding-list">
					{#each ctx.filteredOnboardings as onboarding (onboarding.id)}
						{@const progress = ctx.getProgress(onboarding)}
						{@const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0}
						{@const isExpanded = ctx.expandedOnboardingId === onboarding.id}
						{@const isLegacy = onboarding.templateId === null}
						<div class="onboarding-card" class:expanded={isExpanded}>
							<button class="card-summary" onclick={() => ctx.toggleExpand(onboarding.id)} aria-expanded={isExpanded}>
								<div class="card-main">
									<span class="expand-icon">{isExpanded ? '▼' : '▶'}</span>
									<div class="card-info">
										<span class="person-name">{ctx.getPersonName(onboarding.personnelId)}</span>
										<span class="started-date">Started {formatDisplayDate(onboarding.startedAt)}</span>
									</div>
								</div>
								<div class="card-progress">
									<div class="progress-bar">
										<div
											class="progress-fill"
											style="width: {pct}%; background: {pct === 100 ? 'var(--color-success)' : 'var(--color-primary)'}"
										></div>
									</div>
									<span class="progress-text">{progress.completed}/{progress.total} steps</span>
								</div>
								<div class="card-status">
									<Badge label={STATUS_LABELS[onboarding.status]} color={STATUS_COLORS[onboarding.status]} />
								</div>
							</button>

							{#if isExpanded}
								<div class="card-detail">
									{#if ctx.canEditOnboarding && onboarding.status === 'in_progress'}
										<div class="detail-actions">
											{#if pct === 100}
												<button
													class="btn btn-primary btn-sm"
													onclick={() => ctx.handleCompleteOnboarding(onboarding.id)}
												>
													Mark Complete
												</button>
											{/if}
											{#if isLegacy}
												<button
													class="btn btn-secondary btn-sm"
													onclick={() => ctx.openAssignTemplate(onboarding.id)}
													title="Assign a template to enable re-sync"
												>
													Assign Template
												</button>
											{:else}
												<button
													class="btn btn-secondary btn-sm sync-btn"
													onclick={() => ctx.handleResync(onboarding.id)}
													disabled={ctx.resyncingId === onboarding.id}
													title="Sync with current template: adds new steps, updates incomplete steps"
												>
													{#if ctx.resyncingId === onboarding.id}
														<Spinner color="var(--color-text-secondary)" />
													{:else}
														<svg
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="2"
															class="sync-icon"
														>
															<path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
															<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
														</svg>
													{/if}
													Re-sync
												</button>
											{/if}
											<button class="btn btn-danger btn-sm" onclick={() => (ctx.cancellingId = onboarding.id)}>
												Cancel Onboarding
											</button>
										</div>
									{/if}

									<div class="step-list">
										{#each onboarding.steps as step (step.id)}
											{@const deprecated = ctx.isStepDeprecated(step)}
											{@const isTrainingComplete =
												step.stepType === 'training' && ctx.isTrainingStepComplete(step, onboarding.personnelId)}
											{@const isPaperworkComplete =
												step.stepType === 'paperwork' &&
												(() => {
													const stages = step.stages ?? [];
													return (
														(stages.length > 0 && step.currentStage === stages[stages.length - 1]) || step.completed
													);
												})()}
											{@const isCheckboxComplete = step.stepType === 'checkbox' && step.completed}
											{@const isStepComplete = isTrainingComplete || isPaperworkComplete || isCheckboxComplete}
											<div class="step-row" class:step-complete={isStepComplete} class:step-deprecated={deprecated}>
												<div class="step-main">
													{#if deprecated}
														<Badge label="Deprecated" color="#6b7280" />
													{:else}
														<Badge label={STEP_TYPE_LABELS[step.stepType]} color={STEP_TYPE_COLORS[step.stepType]} />
													{/if}
													<span class="step-name">{step.stepName}</span>

													{#if deprecated}
														{#if step.completed}
															<span class="deprecated-note">Removed from template</span>
														{:else if ctx.canEditOnboarding && onboarding.status === 'in_progress'}
															<button
																class="btn btn-danger btn-sm"
																onclick={() => ctx.handleRemoveDeprecatedStep(step.id)}
																disabled={ctx.removingDeprecatedStepId === step.id}
															>
																{#if ctx.removingDeprecatedStepId === step.id}<Spinner />{/if}
																Remove Step
															</button>
														{:else}
															<span class="deprecated-note">Removed from template</span>
														{/if}
													{:else}
														<div class="step-status">
															{#if step.stepType === 'checkbox'}
																{#if ctx.canEditOnboarding && onboarding.status === 'in_progress'}
																	<button
																		class="checkbox-toggle"
																		class:checked={step.completed}
																		onclick={() => ctx.handleToggleCheckbox(step)}
																		aria-label={step.completed ? 'Mark incomplete' : 'Mark complete'}
																	>
																		{#if step.completed}
																			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
																				<polyline points="20 6 9 17 4 12" />
																			</svg>
																		{/if}
																	</button>
																{:else}
																	<span class="status-icon" class:complete={step.completed}>
																		{step.completed ? '✓' : '—'}
																	</span>
																{/if}
															{:else if step.stepType === 'training'}
																{#if ctx.canEditOnboarding && onboarding.status === 'in_progress'}
																	<button
																		class="training-status-btn"
																		class:complete={isTrainingComplete}
																		class:incomplete={!isTrainingComplete}
																		onclick={() => ctx.handleTrainingStepClick(step, onboarding)}
																		aria-label="Edit training record"
																	>
																		{isTrainingComplete ? '✓' : '✗'}
																	</button>
																{:else}
																	<span
																		class="status-icon"
																		class:complete={isTrainingComplete}
																		class:incomplete={!isTrainingComplete}
																	>
																		{isTrainingComplete ? '✓' : '✗'}
																	</span>
																{/if}
															{:else if step.stepType === 'paperwork'}
																<div class="stage-indicator">
																	<Stepper
																		stages={step.stages ?? []}
																		currentStage={step.currentStage ?? (step.stages ?? [])[0] ?? ''}
																		onStageClick={ctx.canEditOnboarding && onboarding.status === 'in_progress'
																			? (stage) => ctx.handleStageClick(step, stage)
																			: undefined}
																		disabled={!ctx.canEditOnboarding || onboarding.status !== 'in_progress'}
																	/>
																</div>
															{/if}
														</div>
													{/if}
												</div>

												{#if !deprecated}
													<button
														class="notes-toggle"
														onclick={() => ctx.toggleNotes(step.id)}
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
														{#if step.notes.length > 0}
															<span class="notes-count">{step.notes.length}</span>
														{/if}
													</button>

													{#if ctx.expandedNotes.has(step.id)}
														<div class="step-notes">
															{#if ctx.canEditOnboarding && onboarding.status === 'in_progress'}
																<div class="note-input-row">
																	<input
																		type="text"
																		class="input note-input"
																		placeholder="Add a note..."
																		bind:value={ctx.noteInputs[step.id]}
																		onkeydown={(e) => {
																			if (e.key === 'Enter') ctx.handleAddNote(step);
																		}}
																	/>
																	<button
																		class="btn btn-primary btn-sm"
																		onclick={() => ctx.handleAddNote(step)}
																		disabled={!ctx.noteInputs[step.id]?.trim()}
																	>
																		Add
																	</button>
																</div>
															{/if}
															{#if step.notes.length === 0}
																<p class="no-notes">No notes yet.</p>
															{:else}
																<div class="notes-list">
																	{#each step.notes as note}
																		<div class="note-item">
																			<span class="note-text">{note.text}</span>
																			<span class="note-time">{ctx.formatTimestamp(note.timestamp)}</span>
																		</div>
																	{/each}
																</div>
															{/if}
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
	{/if}
</div>

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.no-permission {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		text-align: center;
		color: var(--color-text-muted);
	}
	.no-permission h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-sm);
		color: var(--color-text);
	}

	/* Filter toggle */
	.filter-toggle {
		display: flex;
		align-items: center;
	}

	.filter-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.filter-btn:first-child {
		border-radius: var(--radius-md) 0 0 var(--radius-md);
	}

	.filter-btn:last-child {
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
		border-left: none;
	}

	.filter-btn:hover {
		background: var(--color-bg);
	}

	.filter-btn.active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--color-chrome);
	}

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
	}

	.btn-ghost:hover {
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.warning-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-lg);
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid #f59e0b;
		border-radius: var(--radius-md);
		color: #f59e0b;
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.warning-banner span {
		flex: 1;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-lg);
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
		color: var(--color-error);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.error-banner span {
		flex: 1;
	}

	/* Onboarding list */
	.onboarding-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	/* Onboarding card */
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
		background: rgba(184, 148, 62, 0.04);
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

	.started-date {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.card-progress {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-shrink: 0;
		min-width: 180px;
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

	/* Expanded detail */
	.card-detail {
		border-top: 1px solid var(--color-divider);
		padding: var(--spacing-md) var(--spacing-lg);
	}

	.detail-actions {
		display: flex;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.sync-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.sync-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	/* Step list */
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
		transition: background 0.1s ease;
	}

	.step-row.step-complete {
		opacity: 0.7;
	}

	.step-row.step-deprecated {
		opacity: 0.65;
		background: var(--color-surface-variant);
	}

	.step-main {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex: 1;
		min-width: 0;
	}

	.step-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.deprecated-note {
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

	/* Checkbox toggle */
	.checkbox-toggle {
		width: 22px;
		height: 22px;
		border: 2px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		transition: all 0.15s ease;
	}

	.checkbox-toggle:hover {
		border-color: var(--color-primary);
	}

	.checkbox-toggle.checked {
		background: var(--color-success);
		border-color: var(--color-success);
	}

	.checkbox-toggle svg {
		width: 14px;
		height: 14px;
		color: white;
	}

	/* Status icons */
	.status-icon {
		font-size: var(--font-size-base);
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.status-icon.complete {
		color: var(--color-success);
	}

	.status-icon.incomplete {
		color: var(--color-error);
	}

	/* Training status button (clickable in edit mode) */
	.training-status-btn {
		font-size: var(--font-size-base);
		font-weight: 700;
		color: var(--color-text-muted);
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.training-status-btn:hover {
		border-color: var(--color-primary);
		background: rgba(184, 148, 62, 0.08);
	}

	.training-status-btn.complete {
		color: var(--color-success);
	}

	.training-status-btn.incomplete {
		color: var(--color-error);
	}

	/* Stage indicator */
	.stage-indicator {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	/* Notes toggle */
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

	/* Step notes */
	.step-notes {
		width: 100%;
		margin-top: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-divider);
	}

	.note-input-row {
		display: flex;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-sm);
	}

	.note-input {
		flex: 1;
		font-size: var(--font-size-sm);
	}

	.no-notes {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-style: italic;
		padding: var(--spacing-xs) 0;
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

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.page {
			margin-left: 0;
		}

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

		.note-input-row {
			flex-direction: column;
		}
	}
</style>
