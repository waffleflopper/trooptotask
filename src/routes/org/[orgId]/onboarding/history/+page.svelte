<script lang="ts">
	import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
	import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { formatDisplayDate } from '$lib/utils/dates';
	import {
		formatTimestamp,
		getPersonDisplayName,
		getPersonGroupDisplayName,
		getProgress,
		getTemplateDisplayName,
		STEP_TYPE_LABELS
	} from '$features/onboarding/contexts/OnboardingPageContext.svelte';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarNavItem } from '$lib/components/ui/workspace-toolbar';
	import { Badge } from '$lib/components/ui/badge';
	import * as OnboardingPacketList from '$lib/components/ui/onboarding-packet-list';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let { data } = $props();

	let expandedOnboardingId = $state<string | null>(null);
	const expandedNotes = new SvelteSet<string>();
	const onboardingNavItems = $derived<WorkspaceToolbarNavItem[]>([
		{ label: 'Onboarding', href: `/org/${data.orgId}/onboarding` }
	]);

	const historyOnboardings = $derived(
		onboardingStore.items.filter((o) => o.status === 'completed' || o.status === 'cancelled')
	);

	function toggleNotes(stepId: string) {
		if (expandedNotes.has(stepId)) expandedNotes.delete(stepId);
		else expandedNotes.add(stepId);
	}
</script>

<svelte:head>
	<title>Onboarding History - Troop to Task</title>
</svelte:head>

<div class="page">
	<main class="page-content">
		<WorkspaceToolbar.Root ariaLabel="Onboarding history controls">
			<WorkspaceToolbar.Group label="Onboarding sections">
				<WorkspaceToolbar.Nav ariaLabel="Onboarding sections" items={onboardingNavItems} />
			</WorkspaceToolbar.Group>
		</WorkspaceToolbar.Root>

		{#if historyOnboardings.length === 0}
			<EmptyState message="No completed or cancelled onboardings yet." />
		{:else}
			<OnboardingPacketList.Root
				value={expandedOnboardingId ?? ''}
				onValueChange={(value) => (expandedOnboardingId = value || null)}
			>
				{#each historyOnboardings as onboarding (onboarding.id)}
					{@const groupName = getPersonGroupDisplayName(onboarding.personnelId, personnelStore.items)}
					<OnboardingPacketList.Item value={onboarding.id}>
						<OnboardingPacketList.Trigger>
							<OnboardingPacketList.Summary>
								<OnboardingPacketList.SummaryTitle
									title={getPersonDisplayName(onboarding.personnelId, personnelStore.items)}
									meta={[
										getTemplateDisplayName(onboarding.templateId, onboardingTemplateStore.templates),
										groupName,
										`Started ${formatDisplayDate(onboarding.startedAt)}`,
										onboarding.completedAt ? `Completed ${formatDisplayDate(onboarding.completedAt)}` : null,
										onboarding.cancelledAt ? `Cancelled ${formatDisplayDate(onboarding.cancelledAt)}` : null
									]}
								/>
								{#snippet progress()}
									<OnboardingPacketList.Progress
										value={getProgress(onboarding).completed}
										max={getProgress(onboarding).total}
										prefixLabel="Final Progress"
									/>
								{/snippet}
								{#snippet status()}
									<Badge variant={onboarding.status === 'completed' ? 'success' : 'secondary'}>
										{onboarding.status === 'completed' ? 'Completed' : 'Cancelled'}
									</Badge>
								{/snippet}
							</OnboardingPacketList.Summary>
						</OnboardingPacketList.Trigger>

						<OnboardingPacketList.Content>
							<OnboardingPacketList.StepList>
								{#each onboarding.steps as step (step.id)}
									{@const isInactive = !step.active}
									<OnboardingPacketList.Step
										label={step.stepName}
										typeLabel={isInactive ? 'Removed' : STEP_TYPE_LABELS[step.stepType]}
										tone={isInactive ? 'inactive' : step.stepType}
										state={isInactive ? 'inactive' : step.completed ? 'complete' : 'incomplete'}
										inactiveNote={isInactive
											? step.completed
												? 'Previously completed'
												: 'Removed from template'
											: null}
									>
										{#snippet status()}
											{#if isInactive}
												<OnboardingPacketList.StatusIcon
													state={step.completed ? 'complete' : 'pending'}
													label={step.completed ? 'Previously completed' : 'Inactive'}
												/>
											{:else if step.stepType === 'checkbox' || step.stepType === 'training'}
												<OnboardingPacketList.StatusIcon
													state={step.completed ? 'complete' : 'pending'}
													label={step.completed ? 'Complete' : 'Incomplete'}
												/>
											{:else if step.stepType === 'paperwork'}
												<Stepper
													stages={step.stages ?? []}
													currentStage={step.currentStage ?? (step.stages ?? [])[0] ?? ''}
													disabled={true}
												/>
											{/if}
										{/snippet}

										{#if !isInactive && step.notes.length > 0}
											<OnboardingPacketList.Notes
												open={expandedNotes.has(step.id)}
												onOpenChange={() => toggleNotes(step.id)}
												count={step.notes.length}
												readOnly
											>
												{#each step.notes as note, noteIndex (`${note.timestamp}:${note.userId}:${note.text}:${noteIndex}`)}
													<OnboardingPacketList.Note text={note.text} time={formatTimestamp(note.timestamp)} />
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
</div>

<style>
	.page {
		display: flex;
		height: 100%;
		flex-direction: column;
		background: var(--surface-page);
	}

	.page-content {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}
</style>
