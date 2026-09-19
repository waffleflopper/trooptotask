<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { STEP_TYPE_LABELS, MODAL_IDS } from '../contexts/OnboardingPageContext.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction, WorkspaceToolbarNavItem } from '$lib/components/ui/workspace-toolbar';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Alert from '$lib/components/ui/alert';
	import * as Empty from '$lib/components/ui/empty';
	import * as OnboardingPacketList from '$lib/components/ui/onboarding-packet-list';
	import { Spinner } from '$lib/components/ui/spinner';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import OnboardingPaperworkStageQueue from './OnboardingPaperworkStageQueue.svelte';

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
				priority: 'high'
			});
		}

		if (ctx.canManageWorkflows) {
			actions.push({
				id: 'start-onboarding',
				label: 'Start Onboarding',
				onclick: () => ctx.modals.open(MODAL_IDS.startOnboarding),
				icon: 'clipboard-check',
				disabled: !ctx.hasTemplateSteps,
				disabledReason: !ctx.hasTemplateSteps ? 'Set up template steps before starting an onboarding' : undefined,
				priority: 'critical',
				overflow: 'never',
				variant: 'primary'
			});
		}
		return actions;
	});
</script>

<div class="flex h-full flex-col bg-background">
	{#if !ctx.canViewOnboarding}
		<main class="flex min-h-0 flex-1 overflow-auto p-3 sm:p-6">
			<Empty.Root>
				<Empty.Media variant="icon"><ShieldAlert /></Empty.Media>
				<Empty.Header>
					<Empty.Title>Access Restricted</Empty.Title>
					<Empty.Description>
						You don't have permission to view this area. Contact your organization admin for access.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		</main>
	{:else}
		<main class="flex min-h-0 flex-col gap-4 overflow-auto p-3 sm:px-6 sm:py-4">
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
				{/if}
			</WorkspaceToolbar.Root>

			{#if !ctx.hasTemplateSteps && ctx.onboardings.length > 0}
				<Alert.Root variant="warning">
					<TriangleAlert />
					<Alert.Title>Configuration Required</Alert.Title>
					<Alert.Description>
						No template steps are defined, so new onboardings cannot be started until a template is built.
					</Alert.Description>
					{#if ctx.canManageWorkflows}
						<Alert.Action>
							<Button href={ctx.templatesUrl} size="sm" variant="outline">Manage Templates</Button>
						</Alert.Action>
					{/if}
				</Alert.Root>
			{/if}

			{#if ctx.resyncError}
				<Alert.Root variant="destructive">
					<CircleAlert />
					<Alert.Title>Sync Problem</Alert.Title>
					<Alert.Description>{ctx.resyncError}</Alert.Description>
					<Alert.Action>
						<Button size="sm" variant="outline" onclick={() => (ctx.resyncError = null)}>Dismiss</Button>
					</Alert.Action>
				</Alert.Root>
			{/if}

			{#if ctx.filteredOnboardings.length === 0}
				{#if !ctx.hasTemplateSteps && ctx.onboardings.length === 0}
					{#if ctx.canManageWorkflows}
						<Empty.Root>
							<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
							<Empty.Header>
								<Empty.Title>Set up onboarding</Empty.Title>
								<Empty.Description>
									Set up your onboarding template to get started. Define the requirements new members need to complete.
								</Empty.Description>
							</Empty.Header>
							<Empty.Content>
								<Button href={ctx.templatesUrl}>Set Up Template</Button>
							</Empty.Content>
						</Empty.Root>
					{:else}
						<Empty.Root>
							<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
							<Empty.Header>
								<Empty.Title>Onboarding not configured</Empty.Title>
								<Empty.Description>Onboarding has not been configured yet.</Empty.Description>
							</Empty.Header>
						</Empty.Root>
					{/if}
				{:else}
					<Empty.Root>
						<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
						<Empty.Header>
							<Empty.Title>No active onboardings</Empty.Title>
							<Empty.Description>No active onboardings. Start one to begin tracking a new member.</Empty.Description>
						</Empty.Header>
					</Empty.Root>
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
															{#if ctx.removingDeprecatedStepId === step.id}
																<Spinner />
															{/if}
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
												{/if}
											{/snippet}

											{#if step.stepType === 'paperwork' && !isInactive}
												<OnboardingPaperworkStageQueue
													{step}
													canManage={canActOnThisOnboarding}
													inset={false}
													onSelect={(stage) => ctx.handleStageClick(step, stage)}
												/>
											{/if}

											{#if !isInactive}
												<OnboardingPacketList.Notes
													open={ctx.expandedNotes.has(step.id)}
													onOpenChange={() => ctx.toggleNotes(step.id)}
													count={step.notes.length}
												>
													{#if canActOnThisOnboarding}
														<OnboardingPacketList.NoteInput
															bind:value={
																() => ctx.noteInputs[step.id] ?? '', (value) => (ctx.noteInputs[step.id] = value)
															}
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
