<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { STEP_TYPE_LABELS, MODAL_IDS } from '../contexts/OnboardingPageContext.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction, WorkspaceToolbarNavItem } from '$lib/components/ui/workspace-toolbar';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as OnboardingPacketList from '$lib/components/ui/onboarding-packet-list';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';

	interface Props {
		ctx: OnboardingPageContext;
	}

	let { ctx }: Props = $props();

	const onboardingNavItems = $derived.by<WorkspaceToolbarNavItem[]>(() => {
		return [{ label: 'History', href: ctx.historyUrl }];
	});

	const onboardingToolbarActions = $derived.by<WorkspaceToolbarAction[]>(() => {
		const actions: WorkspaceToolbarAction[] = [];
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

		if (ctx.canManageWorkflows) {
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
			<WorkspaceToolbar.Root ariaLabel="Onboarding controls">
				<WorkspaceToolbar.Group label="Onboarding sections">
					<WorkspaceToolbar.Nav ariaLabel="Onboarding sections" items={onboardingNavItems} />
				</WorkspaceToolbar.Group>

				{#if onboardingToolbarActions.length > 0}
					<WorkspaceToolbar.Group label="Onboarding actions" zone="actions">
						<WorkspaceToolbar.Actions
							actions={onboardingToolbarActions}
							ariaLabel="Onboarding actions"
							overflowAriaLabel="More onboarding actions"
						/>
					</WorkspaceToolbar.Group>
					{#if ctx.readOnly}
						<WorkspaceToolbar.Group label="Onboarding edit status" zone="meta">
							<WorkspaceToolbar.Meta tone="warning">Upgrade to edit</WorkspaceToolbar.Meta>
						</WorkspaceToolbar.Group>
					{/if}
				{/if}
			</WorkspaceToolbar.Root>

			{#if !ctx.hasTemplateSteps && ctx.onboardings.length > 0}
				<div class="notice-banner notice-banner--warning">
					<div class="notice-copy">
						<p class="notice-label">Configuration Required</p>
						<p>No template steps are defined, so new onboardings cannot be started until a template is built.</p>
					</div>
					{#if ctx.canManageWorkflows}
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
					{#if ctx.canManageWorkflows}
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
				<OnboardingPacketList.Root
					value={ctx.expandedOnboardingId ?? ''}
					onValueChange={(value) => (ctx.expandedOnboardingId = value || null)}
				>
					{#each ctx.filteredOnboardings as onboarding (onboarding.id)}
						{@const groupName = ctx.getPersonGroupName(onboarding.personnelId)}
						{@const canManageThisOnboarding = ctx.canManageOnboarding(onboarding)}
						{@const canActOnThisOnboarding = canManageThisOnboarding && onboarding.status === 'in_progress'}
						<OnboardingPacketList.Item value={onboarding.id}>
							<OnboardingPacketList.Trigger>
								<OnboardingPacketList.Summary>
									<OnboardingPacketList.SummaryTitle
										title={ctx.getPersonName(onboarding.personnelId)}
										meta={[
											ctx.getTemplateName(onboarding.templateId),
											groupName,
											`Started ${formatDisplayDate(onboarding.startedAt)}`
										]}
									/>
									{#snippet progress()}
										<OnboardingPacketList.Progress
											value={ctx.getProgress(onboarding).completed}
											max={ctx.getProgress(onboarding).total}
										/>
									{/snippet}
								</OnboardingPacketList.Summary>
							</OnboardingPacketList.Trigger>

							<OnboardingPacketList.Content>
								{#if canActOnThisOnboarding}
									<OnboardingPacketList.Actions>
										<Button size="sm" onclick={() => ctx.promptCompleteOnboarding(onboarding.id)}>Mark Complete</Button>
										{#if onboarding.templateId === null}
											<Button
												size="sm"
												variant="outline"
												onclick={() => ctx.openAssignTemplate(onboarding.id)}
												title="Assign a template to enable re-sync"
											>
												Assign Template
											</Button>
										{:else}
											<Button
												size="sm"
												variant="outline"
												onclick={() => ctx.handleResync(onboarding.id)}
												disabled={ctx.resyncingId === onboarding.id}
												title="Sync with current template"
											>
												{#if ctx.resyncingId === onboarding.id}
													<Spinner />
												{/if}
												Re-sync
											</Button>
											{#if ctx.canManageConfig}
												<Button
													size="sm"
													variant="outline"
													onclick={() => ctx.openSwitchTemplate(onboarding.id)}
													title="Switch to a different template"
												>
													Switch Template
												</Button>
											{/if}
										{/if}
										<Button size="sm" variant="destructive" onclick={() => (ctx.cancellingId = onboarding.id)}>
											Cancel
										</Button>
									</OnboardingPacketList.Actions>
								{/if}

								<OnboardingPacketList.StepList>
									{#each onboarding.steps as step (step.id)}
										{@const isInactive = !step.active}
										<OnboardingPacketList.Step
											label={step.stepName}
											typeLabel={isInactive ? 'Removed' : STEP_TYPE_LABELS[step.stepType]}
											tone={isInactive ? 'inactive' : step.stepType}
											state={isInactive ? 'inactive' : step.completed ? 'complete' : 'incomplete'}
											meta={ctx.getTrainingTypeName(step)}
											inactiveNote={isInactive && !canActOnThisOnboarding
												? step.completed
													? 'Previously completed'
													: 'Removed from template'
												: null}
										>
											{#snippet status()}
												{#if isInactive}
													{#if step.completed}
														<OnboardingPacketList.StatusIcon state="complete" label="Previously completed" />
													{:else if canActOnThisOnboarding}
														<Button
															size="sm"
															variant="destructive"
															onclick={() => ctx.handleRemoveDeprecatedStep(step.id)}
															disabled={ctx.removingDeprecatedStepId === step.id}
														>
															{#if ctx.removingDeprecatedStepId === step.id}<Spinner />{/if}
															Remove
														</Button>
													{/if}
												{:else if step.stepType === 'checkbox'}
													{#if canActOnThisOnboarding}
														<Checkbox
															checked={step.completed}
															onclick={() => ctx.handleToggleCheckbox(step)}
															aria-label={step.completed ? 'Mark incomplete' : 'Mark complete'}
														/>
													{:else}
														<OnboardingPacketList.StatusIcon
															state={step.completed ? 'complete' : 'pending'}
															label={step.completed ? 'Complete' : 'Incomplete'}
														/>
													{/if}
												{:else if step.stepType === 'training'}
													<OnboardingPacketList.StatusIcon
														state={step.completed ? 'complete' : 'incomplete'}
														label={step.completed ? 'Training complete' : 'Training incomplete'}
													/>
													{#if !step.completed}
														<Button href={ctx.trainingPageUrl} variant="outline" size="sm">Record Training</Button>
													{/if}
												{:else if step.stepType === 'paperwork'}
													<Stepper
														stages={step.stages ?? []}
														currentStage={step.currentStage ?? (step.stages ?? [])[0] ?? ''}
														onStageClick={canActOnThisOnboarding
															? (stage) => ctx.handleStageClick(step, stage)
															: undefined}
														disabled={!canActOnThisOnboarding}
													/>
												{/if}
											{/snippet}

											{#if !isInactive}
												<OnboardingPacketList.Notes
													open={ctx.expandedNotes.has(step.id)}
													onOpenChange={() => ctx.toggleNotes(step.id)}
													count={step.notes.length}
												>
													{#if canActOnThisOnboarding}
														<OnboardingPacketList.NoteInput
															bind:value={ctx.noteInputs[step.id]}
															onAdd={() => ctx.handleAddNote(step)}
														/>
													{/if}
													{#each step.notes as note, noteIndex (`${note.timestamp}:${note.userId}:${note.text}:${noteIndex}`)}
														<OnboardingPacketList.Note text={note.text} time={ctx.formatTimestamp(note.timestamp)} />
													{/each}
												</OnboardingPacketList.Notes>
											{/if}
										</OnboardingPacketList.Step>
									{/each}
								</OnboardingPacketList.StepList>
							</OnboardingPacketList.Content>
						</OnboardingPacketList.Item>
					{/each}
				</OnboardingPacketList.Root>
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

	@media (max-width: 640px) {
		.page-content {
			padding: var(--sp-3);
		}

		.notice-banner {
			padding: var(--sp-3);
		}
	}
</style>
