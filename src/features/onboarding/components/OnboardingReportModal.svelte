<script lang="ts">
	import type { PersonnelOnboarding, OnboardingStepProgress, OnboardingTemplate } from '../onboarding.types';
	import type { Personnel } from '$lib/types';
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	interface Props {
		onboardings: PersonnelOnboarding[];
		personnel: Personnel[];
		templates: OnboardingTemplate[];
		trainingTypeNames: Map<string, string>;
		onClose: () => void;
	}

	let { onboardings, personnel, templates, trainingTypeNames, onClose }: Props = $props();

	let selectedTemplateId = $state<string>('all');

	function getPersonName(personnelId: string): string {
		const p = personnel.find((pr) => pr.id === personnelId);
		return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
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
		trainingTypeName: string | null;
		totalPeople: number;
		incomplete: { personnelId: string; detail: string }[];
	}

	const filteredOnboardings = $derived.by(() => {
		const active = onboardings.filter((o) => o.status === 'in_progress');
		if (selectedTemplateId === 'all') return active;
		if (selectedTemplateId === 'none') return active.filter((o) => o.templateId === null);
		return active.filter((o) => o.templateId === selectedTemplateId);
	});

	const report = $derived.by<StepReport[]>(() => {
		if (filteredOnboardings.length === 0) return [];

		const stepMap = new Map<string, StepReport>();

		for (const onboarding of filteredOnboardings) {
			for (const step of onboarding.steps) {
				if (!step.active) continue;
				const key = `${step.stepName}::${step.stepType}`;
				if (!stepMap.has(key)) {
					stepMap.set(key, {
						stepName: step.stepName,
						stepType: step.stepType,
						trainingTypeName:
							step.stepType === 'training' && step.trainingTypeId
								? (trainingTypeNames.get(step.trainingTypeId) ?? null)
								: null,
						totalPeople: 0,
						incomplete: []
					});
				}
				const entry = stepMap.get(key)!;
				entry.totalPeople++;

				if (!step.completed) {
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

	const templateOptions = $derived.by(() => {
		const usedTemplateIds = new Set(
			onboardings.filter((o) => o.status === 'in_progress' && o.templateId).map((o) => o.templateId)
		);
		const hasUnassigned = onboardings.some((o) => o.status === 'in_progress' && !o.templateId);
		const options: { value: string; label: string }[] = [{ value: 'all', label: 'All Templates' }];
		for (const t of templates) {
			if (usedTemplateIds.has(t.id)) {
				options.push({ value: t.id, label: t.name });
			}
		}
		if (hasUnassigned) {
			options.push({ value: 'none', label: 'No Template' });
		}
		return options;
	});
</script>

<Modal title="Onboarding Report" {onClose} width="600px" titleId="onboarding-report-title">
	{#if templateOptions.length > 2}
		<div class="template-filter">
			<select class="select" bind:value={selectedTemplateId}>
				{#each templateOptions as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
	{/if}

	{#if report.length === 0}
		<p class="empty-msg">No active onboardings to report on.</p>
	{:else}
		<p class="summary">{filteredOnboardings.length} active onboarding{filteredOnboardings.length === 1 ? '' : 's'}</p>

		<div class="report-list">
			{#each report as step}
				{@const completedCount = step.totalPeople - step.incomplete.length}
				<div class="report-step" class:all-done={step.incomplete.length === 0}>
					<div class="step-header">
						<Badge label={stepTypeLabels[step.stepType]} color={stepTypeColors[step.stepType]} />
						<span class="step-name">
							{step.stepName}{#if step.trainingTypeName && step.trainingTypeName !== step.stepName}
								<span class="training-type-hint">({step.trainingTypeName})</span>
							{/if}
						</span>
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
	.template-filter {
		margin-bottom: var(--spacing-md);
	}

	.template-filter .select {
		width: 100%;
	}

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

	.training-type-hint {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
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
