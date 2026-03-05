<script lang="ts">
	import type { PersonnelOnboarding, OnboardingStepProgress, Personnel, TrainingType, PersonnelTraining } from '$lib/types';
	import Modal from './Modal.svelte';
	import Badge from './ui/Badge.svelte';

	interface Props {
		onboardings: PersonnelOnboarding[];
		personnel: Personnel[];
		trainingTypes: TrainingType[];
		personnelTrainings: PersonnelTraining[];
		onClose: () => void;
	}

	let { onboardings, personnel, trainingTypes, personnelTrainings, onClose }: Props = $props();

	function getPersonName(personnelId: string): string {
		const p = personnel.find((pr) => pr.id === personnelId);
		return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
	}

	function isTrainingStepComplete(step: OnboardingStepProgress, personnelId: string): boolean {
		if (!step.trainingTypeId) return false;
		const type = trainingTypes.find((t) => t.id === step.trainingTypeId);
		if (type && type.canBeExempted && type.exemptPersonnelIds.includes(personnelId)) return true;
		const training = personnelTrainings.find(
			(t) => t.personnelId === personnelId && t.trainingTypeId === step.trainingTypeId
		);
		if (!training) return false;
		if (type && type.expirationMonths === null && !type.expirationDateOnly) return true;
		if (training.expirationDate) return new Date(training.expirationDate) >= new Date();
		return training.completionDate !== null;
	}

	function isStepComplete(step: OnboardingStepProgress, personnelId: string): boolean {
		if (step.stepType === 'training') return isTrainingStepComplete(step, personnelId);
		if (step.stepType === 'paperwork') {
			const stages = step.stages ?? [];
			return (stages.length > 0 && step.currentStage === stages[stages.length - 1]) || step.completed;
		}
		return step.completed;
	}

	const stepTypeColors: Record<string, string> = {
		training: '#3b82f6',
		paperwork: '#f59e0b',
		checkbox: '#6b7280'
	};

	const stepTypeLabels: Record<string, string> = {
		training: 'Training',
		paperwork: 'Paperwork',
		checkbox: 'Checkbox'
	};

	interface StepReport {
		stepName: string;
		stepType: string;
		totalPeople: number;
		incomplete: { personnelId: string; detail: string }[];
	}

	const report = $derived.by<StepReport[]>(() => {
		const activeOnboardings = onboardings.filter((o) => o.status === 'in_progress');
		if (activeOnboardings.length === 0) return [];

		// Group by step name + type (template steps are the same across onboardings)
		const stepMap = new Map<string, StepReport>();

		for (const onboarding of activeOnboardings) {
			for (const step of onboarding.steps) {
				const key = `${step.stepName}::${step.stepType}`;
				if (!stepMap.has(key)) {
					stepMap.set(key, {
						stepName: step.stepName,
						stepType: step.stepType,
						totalPeople: 0,
						incomplete: []
					});
				}
				const entry = stepMap.get(key)!;
				entry.totalPeople++;

				if (!isStepComplete(step, onboarding.personnelId)) {
					let detail = '';
					if (step.stepType === 'paperwork') {
						const stages = step.stages ?? [];
						if (stages.length > 0) {
							detail = step.currentStage ?? stages[0] ?? '';
						}
					}
					entry.incomplete.push({ personnelId: onboarding.personnelId, detail });
				}
			}
		}

		// Sort: most incomplete first, then alphabetical
		return Array.from(stepMap.values()).sort((a, b) => {
			if (b.incomplete.length !== a.incomplete.length) return b.incomplete.length - a.incomplete.length;
			return a.stepName.localeCompare(b.stepName);
		});
	});

	const totalActive = $derived(onboardings.filter((o) => o.status === 'in_progress').length);
</script>

<Modal title="Onboarding Report" {onClose} width="600px" titleId="onboarding-report-title">
	{#if report.length === 0}
		<p class="empty-msg">No active onboardings to report on.</p>
	{:else}
		<p class="summary">{totalActive} active onboarding{totalActive === 1 ? '' : 's'}</p>

		<div class="report-list">
			{#each report as step}
				{@const completedCount = step.totalPeople - step.incomplete.length}
				<div class="report-step" class:all-done={step.incomplete.length === 0}>
					<div class="step-header">
						<Badge label={stepTypeLabels[step.stepType]} color={stepTypeColors[step.stepType]} />
						<span class="step-name">{step.stepName}</span>
						<span class="step-count" class:complete={step.incomplete.length === 0}>
							{completedCount}/{step.totalPeople}
						</span>
					</div>

					{#if step.incomplete.length > 0}
						<div class="incomplete-list">
							{#each step.incomplete as person}
								<div class="person-row">
									<span class="person-name">{getPersonName(person.personnelId)}</span>
									{#if person.detail}
										<span class="person-detail">Stage: {person.detail}</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Close</button>
	{/snippet}
</Modal>

<style>
	.empty-msg {
		color: var(--color-text-muted);
		font-style: italic;
		padding: var(--spacing-lg) 0;
		text-align: center;
	}

	.summary {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-md);
	}

	.report-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		max-height: 60vh;
		overflow-y: auto;
	}

	.report-step {
		background: var(--color-bg);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
	}

	.report-step.all-done {
		opacity: 0.6;
	}

	.step-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.step-name {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.step-count {
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.step-count.complete {
		color: var(--color-success);
	}

	.incomplete-list {
		margin-top: var(--spacing-xs);
		padding-left: calc(var(--spacing-lg) + var(--spacing-sm));
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.person-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.person-name {
		color: var(--color-text);
	}

	.person-detail {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}
</style>
