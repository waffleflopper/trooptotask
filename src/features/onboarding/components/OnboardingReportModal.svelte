<script lang="ts">
	import type { PersonnelOnboarding, OnboardingTemplate } from '../onboarding.types';
	import type { Personnel } from '$lib/types';
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { SvelteMap } from 'svelte/reactivity';

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
		paperwork: '#c47f00',
		checkbox: '#6b7280'
	};

	const stepTypeLabels: Record<string, string> = {
		training: 'Training',
		paperwork: 'Paperwork',
		checkbox: 'Checkbox'
	};

	interface StepReport {
		key: string;
		stepName: string;
		stepType: string;
		trainingTypeName: string | null;
		totalPeople: number;
		incomplete: { key: string; personnelId: string; detail: string }[];
	}

	const filteredOnboardings = $derived.by(() => {
		const active = onboardings.filter((o) => o.status === 'in_progress');
		if (selectedTemplateId === 'all') return active;
		if (selectedTemplateId === 'none') return active.filter((o) => o.templateId === null);
		return active.filter((o) => o.templateId === selectedTemplateId);
	});

	const report = $derived.by<StepReport[]>(() => {
		if (filteredOnboardings.length === 0) return [];

		const stepMap = new SvelteMap<string, StepReport>();

		for (const onboarding of filteredOnboardings) {
			for (const step of onboarding.steps) {
				if (!step.active) continue;
				const key = `${step.stepName}::${step.stepType}`;
				if (!stepMap.has(key)) {
					stepMap.set(key, {
						key,
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
					entry.incomplete.push({ key: `${onboarding.id}:${step.id}`, personnelId: onboarding.personnelId, detail });
				}
			}
		}

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
			if (usedTemplateIds.has(t.id)) options.push({ value: t.id, label: t.name });
		}
		if (hasUnassigned) options.push({ value: 'none', label: 'No Template' });
		return options;
	});
</script>

<Modal title="Onboarding Report" {onClose} width="720px" titleId="onboarding-report-title">
	<div class="report-shell">
		<div class="report-summary">
			<p class="eyebrow">Readiness report</p>
			<h3>See which onboarding steps are still holding people up.</h3>
			<p>
				Review the current bottlenecks across active onboarding packets and narrow the list to a specific template when
				needed.
			</p>
		</div>

		<div class="report-toolbar">
			<div class="toolbar-stat">
				<span class="toolbar-label">Active packets</span>
				<strong>{filteredOnboardings.length}</strong>
			</div>
			{#if templateOptions.length > 1}
				<label class="toolbar-filter">
					<span class="label">Template</span>
					<select class="select" bind:value={selectedTemplateId}>
						{#each templateOptions as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>

		{#if report.length === 0}
			<p class="empty-msg">No active onboardings to report on.</p>
		{:else}
			<div class="report-list">
				{#each report as step (step.key)}
					{@const completedCount = step.totalPeople - step.incomplete.length}
					<div class="report-step" class:all-done={step.incomplete.length === 0}>
						<div class="step-header">
							<div class="step-title">
								<Badge label={stepTypeLabels[step.stepType]} color={stepTypeColors[step.stepType]} />
								<span class="step-name">
									{step.stepName}
									{#if step.trainingTypeName && step.trainingTypeName !== step.stepName}
										<span class="training-type-hint">({step.trainingTypeName})</span>
									{/if}
								</span>
							</div>
							<span class="step-count" class:complete={step.incomplete.length === 0}
								>{completedCount}/{step.totalPeople}</span
							>
						</div>

						{#if step.incomplete.length > 0}
							<div class="incomplete-list">
								{#each step.incomplete as person (person.key)}
									<div class="person-row">
										<span class="person-name">{getPersonName(person.personnelId)}</span>
										{#if person.detail}
											<span class="person-detail">Current stage: {person.detail}</span>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<p class="all-clear">Every active packet has cleared this step.</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-secondary" type="button" onclick={onClose}>Close</button>
	{/snippet}
</Modal>

<style>
	.report-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.report-summary,
	.report-toolbar,
	.report-step {
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.report-summary {
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
	}

	.eyebrow,
	.toolbar-label {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.report-summary h3 {
		margin: var(--sp-1) 0 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: var(--font-weight-display);
		line-height: 0.95;
		text-transform: uppercase;
	}

	.report-summary p:last-child {
		margin: var(--sp-2) 0 0;
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.report-toolbar {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--sp-3);
		background: color-mix(in srgb, var(--surface-subtle) 58%, var(--surface-panel) 42%);
	}

	.toolbar-stat {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.toolbar-stat strong {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		line-height: 0.95;
	}

	.toolbar-filter {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		min-width: min(100%, 260px);
	}

	.empty-msg,
	.all-clear {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.empty-msg {
		padding: var(--sp-4) 0;
		text-align: center;
	}

	.report-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		max-height: 60vh;
		overflow-y: auto;
	}

	.report-step.all-done {
		background: color-mix(in srgb, var(--success-bg) 84%, var(--surface-panel) 16%);
	}

	.step-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.step-title {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
	}

	.step-name {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.35;
	}

	.training-type-hint {
		font-weight: 400;
		color: var(--text-secondary);
	}

	.step-count {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		color: var(--text-secondary);
	}

	.step-count.complete {
		color: var(--success);
	}

	.incomplete-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
		padding-top: var(--sp-2);
		border-top: var(--border-rule);
	}

	.person-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.person-name {
		font-size: var(--text-sm);
		color: var(--text-primary);
	}

	.person-detail {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-tertiary);
	}

	@media (max-width: 640px) {
		.report-toolbar,
		.person-row,
		.step-header,
		.step-title {
			flex-direction: column;
			align-items: flex-start;
		}

		.toolbar-filter {
			width: 100%;
			min-width: 0;
		}
	}
</style>
