<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { STEP_TYPE_LABELS, MODAL_IDS } from '../contexts/OnboardingPageContext.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import {
		Toolbar,
		ToolbarActions,
		ToolbarMetaItem,
		ToolbarNavGroup,
		type ToolbarActionConfig,
		type ToolbarNavItem
	} from '$lib/components/ui/toolbar';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';

	interface Props {
		ctx: OnboardingPageContext;
	}

	let { ctx }: Props = $props();

	const onboardingNavItems = $derived.by<ToolbarNavItem[]>(() => {
		return [{ label: 'History', href: ctx.historyUrl }];
	});

	const onboardingToolbarActions = $derived.by<ToolbarActionConfig[]>(() => {
		const actions: ToolbarActionConfig[] = [];
		for (const item of ctx.overflowItems) {
			if (item.href === ctx.templatesUrl || item.label === 'Manage Templates') continue;
			actions.push({
				id: item.label
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, ''),
				label: item.label,
				href: item.href,
				onclick: item.onclick,
				icon: item.label.toLowerCase().includes('report') ? 'chart' : undefined,
				disabled: item.disabled,
				disabledReason: item.disabledReason,
				priority: 'normal'
			});
		}

		if (ctx.canManageConfig) {
			actions.push({
				id: 'manage-templates',
				label: 'Manage Templates',
				href: ctx.templatesUrl,
				icon: 'book-open',
				disabled: ctx.readOnly,
				disabledReason: ctx.readOnly ? 'Upgrade to edit' : undefined,
				priority: 'high'
			});
		}

		if (ctx.canEditOnboarding) {
			actions.push({
				id: 'start-onboarding',
				label: 'Start Onboarding',
				onclick: () => ctx.modals.open(MODAL_IDS.startOnboarding),
				icon: 'clipboard-check',
				disabled: !ctx.hasTemplateSteps || ctx.readOnly,
				disabledReason: !ctx.hasTemplateSteps ? 'Set up template steps before starting an onboarding' : undefined,
				priority: 'critical',
				overflow: 'never',
				variant: 'primary'
			});
		}
		return actions;
	});
</script>

<div class="page">
	{#if !ctx.canViewOnboarding}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content">
			<Toolbar ariaLabel="Onboarding controls" collapse="narrow">
				{#snippet leading()}
					<ToolbarNavGroup ariaLabel="Onboarding sections" items={onboardingNavItems} />
				{/snippet}

				{#if onboardingToolbarActions.length > 0}
					<ToolbarActions
						actions={onboardingToolbarActions}
						ariaLabel="Onboarding actions"
						overflowAriaLabel="More onboarding actions"
						overflowIconOnly
					/>
					{#if ctx.readOnly}
						<ToolbarMetaItem label="Upgrade to edit" tone="warning" />
					{/if}
				{/if}
			</Toolbar>

			{#if !ctx.hasTemplateSteps && ctx.onboardings.length > 0}
				<div class="notice-banner notice-banner--warning">
					<div class="notice-copy">
						<p class="notice-label">Configuration Required</p>
						<p>No template steps are defined, so new onboardings cannot be started until a template is built.</p>
					</div>
					{#if ctx.canEditOnboarding}
						<a href={ctx.templatesUrl} class="btn btn-sm btn-secondary">Manage Templates</a>
					{/if}
				</div>
			{/if}

			{#if ctx.resyncError}
				<div class="notice-banner notice-banner--danger">
					<div class="notice-copy">
						<p class="notice-label">Sync Problem</p>
						<p>{ctx.resyncError}</p>
					</div>
					<button class="btn btn-sm btn-secondary" type="button" onclick={() => (ctx.resyncError = null)}
						>Dismiss</button
					>
				</div>
			{/if}

			{#if ctx.filteredOnboardings.length === 0}
				{#if !ctx.hasTemplateSteps && ctx.onboardings.length === 0}
					{#if ctx.canEditOnboarding}
						<EmptyState
							message="Set up your onboarding template to get started. Define the requirements new members need to complete."
							actionLabel="Set Up Template"
							actionHref={ctx.templatesUrl}
						/>
					{:else}
						<EmptyState message="Onboarding has not been configured yet." />
					{/if}
				{:else}
					<EmptyState message="No active onboardings. Start one to begin tracking a new member." />
				{/if}
			{:else}
				<div class="onboarding-list">
					{#each ctx.filteredOnboardings as onboarding (onboarding.id)}
						{@const progress = ctx.getProgress(onboarding)}
						{@const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0}
						{@const isExpanded = ctx.expandedOnboardingId === onboarding.id}
						{@const groupName = ctx.getPersonGroupName(onboarding.personnelId)}
						<div class="onboarding-card" class:expanded={isExpanded}>
							<button
								class="card-summary"
								type="button"
								onclick={() => ctx.toggleExpand(onboarding.id)}
								aria-expanded={isExpanded}
							>
								<div class="card-main">
									<span class="expand-icon">{isExpanded ? '▼' : '▶'}</span>
									<div class="card-info">
										<span class="person-name">{ctx.getPersonName(onboarding.personnelId)}</span>
										<div class="card-meta">
											<span class="template-name">{ctx.getTemplateName(onboarding.templateId)}</span>
											{#if groupName}
												<span class="meta-sep">·</span>
												<span>{groupName}</span>
											{/if}
											<span class="meta-sep">·</span>
											<span>Started {formatDisplayDate(onboarding.startedAt)}</span>
										</div>
									</div>
								</div>
								<div class="card-progress">
									<div class="progress-bar">
										<div class="progress-fill" class:progress-complete={pct === 100} style="width: {pct}%"></div>
									</div>
									<span class="progress-text">{progress.completed}/{progress.total} complete</span>
								</div>
							</button>

							{#if isExpanded}
								<div class="card-detail">
									{#if ctx.canEditOnboarding && onboarding.status === 'in_progress'}
										<div class="detail-actions">
											<button
												class="btn btn-primary btn-sm"
												type="button"
												onclick={() => ctx.promptCompleteOnboarding(onboarding.id)}
											>
												Mark Complete
											</button>
											{#if onboarding.templateId === null}
												<button
													class="btn btn-secondary btn-sm"
													type="button"
													onclick={() => ctx.openAssignTemplate(onboarding.id)}
													title="Assign a template to enable re-sync"
												>
													Assign Template
												</button>
											{:else}
												<button
													class="btn btn-secondary btn-sm sync-btn"
													type="button"
													onclick={() => ctx.handleResync(onboarding.id)}
													disabled={ctx.resyncingId === onboarding.id}
													title="Sync with current template"
												>
													{#if ctx.resyncingId === onboarding.id}
														<Spinner color="var(--text-secondary)" />
													{:else}
														<svg
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="2"
															class="sync-icon"
														>
															<path d="M23 4v6h-6" />
															<path d="M1 20v-6h6" />
															<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
														</svg>
													{/if}
													Re-sync
												</button>
												{#if ctx.canManageConfig}
													<button
														class="btn btn-secondary btn-sm"
														type="button"
														onclick={() => ctx.openSwitchTemplate(onboarding.id)}
														title="Switch to a different template"
													>
														Switch Template
													</button>
												{/if}
											{/if}
											<button
												class="btn btn-danger btn-sm"
												type="button"
												onclick={() => (ctx.cancellingId = onboarding.id)}
											>
												Cancel
											</button>
										</div>
									{/if}

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

													<span class="step-name">
														{step.stepName}
														{#if ctx.getTrainingTypeName(step)}
															<span class="training-type-hint">({ctx.getTrainingTypeName(step)})</span>
														{/if}
													</span>

													{#if isInactive}
														{#if step.completed}
															<span class="inactive-note">Previously completed</span>
														{:else if ctx.canEditOnboarding && onboarding.status === 'in_progress'}
															<button
																class="btn btn-danger btn-sm"
																type="button"
																onclick={() => ctx.handleRemoveDeprecatedStep(step.id)}
																disabled={ctx.removingDeprecatedStepId === step.id}
															>
																{#if ctx.removingDeprecatedStepId === step.id}<Spinner />{/if}
																Remove
															</button>
														{:else}
															<span class="inactive-note">Removed from template</span>
														{/if}
													{:else}
														<div class="step-status">
															{#if step.stepType === 'checkbox'}
																{#if ctx.canEditOnboarding && onboarding.status === 'in_progress'}
																	<button
																		class="checkbox-toggle"
																		class:checked={step.completed}
																		type="button"
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
																	<span class="status-icon" class:complete={step.completed}
																		>{step.completed ? '✓' : '—'}</span
																	>
																{/if}
															{:else if step.stepType === 'training'}
																<span
																	class="status-icon"
																	class:complete={step.completed}
																	class:incomplete={!step.completed}
																>
																	{step.completed ? '✓' : '✗'}
																</span>
																{#if !step.completed}
																	<a href={ctx.trainingPageUrl} class="training-link">Record Training</a>
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

												{#if !isInactive}
													<button
														class="notes-toggle"
														type="button"
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
																		type="button"
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
																	{#each step.notes as note, noteIndex (`${note.timestamp}:${note.userId}:${note.text}:${noteIndex}`)}
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
		background: var(--surface-page);
	}

	.no-permission {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 320px;
		text-align: center;
		color: var(--text-secondary);
	}

	.no-permission h2 {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: var(--font-weight-display);
		line-height: 0.95;
		text-transform: uppercase;
	}

	.page-content {
		display: flex;
		min-height: 0;
		flex-direction: column;
		gap: var(--sp-4);
		overflow: auto;
		padding: var(--sp-4) var(--sp-6) var(--sp-5);
	}

	.notice-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.notice-banner {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
	}

	.notice-banner--warning {
		background: color-mix(in srgb, var(--amber-light) 82%, var(--surface-panel) 18%);
	}

	.notice-banner--danger {
		background: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);
	}

	.notice-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		flex: 1;
	}

	.notice-copy p {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
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
		white-space: nowrap;
	}

	.card-detail {
		padding: var(--sp-4);
		border-top: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 42%, var(--surface-panel) 58%);
	}

	.detail-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
		padding-bottom: var(--sp-3);
		border-bottom: var(--border-rule);
	}

	.sync-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
	}

	.sync-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
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
		transition: opacity 0.15s ease;
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

	.training-type-hint {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: 400;
		color: var(--text-secondary);
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
		flex-shrink: 0;
	}

	.checkbox-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: white;
		cursor: pointer;
	}

	.checkbox-toggle.checked {
		background: var(--success);
		border-color: var(--success);
	}

	.checkbox-toggle svg {
		width: 14px;
		height: 14px;
	}

	.status-icon {
		font-size: var(--text-base);
		font-weight: 700;
		color: var(--text-tertiary);
	}

	.status-icon.complete {
		color: var(--success);
	}

	.status-icon.incomplete {
		color: var(--danger);
	}

	.training-link {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber-dark);
		text-decoration: underline;
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
		transition: all var(--transition-fast);
	}

	.notes-toggle:hover {
		background: var(--surface-subtle);
		color: var(--text-primary);
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

	.note-input-row {
		display: flex;
		gap: var(--sp-2);
		margin-bottom: var(--sp-2);
	}

	.note-input {
		flex: 1;
	}

	.no-notes {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-tertiary);
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
	}

	@media (max-width: 640px) {
		.page-content {
			padding: var(--sp-3);
		}

		.notice-banner,
		.card-summary,
		.card-detail {
			padding: var(--sp-3);
		}

		.card-meta {
			flex-wrap: wrap;
			white-space: normal;
		}

		.step-main {
			flex-wrap: wrap;
		}

		.step-status {
			width: 100%;
			margin-left: 0;
			justify-content: flex-start;
		}

		.note-input-row {
			flex-direction: column;
		}
	}
</style>
