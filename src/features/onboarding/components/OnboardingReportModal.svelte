<script lang="ts">
	import type { PersonnelOnboarding, OnboardingTemplate } from '../onboarding.types';
	import type { Personnel } from '$lib/types';
	import Modal from '$lib/components/Modal.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
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

	const stepTypeLabels: Record<string, string> = {
		training: 'Training',
		paperwork: 'Paperwork',
		checkbox: 'Checkbox'
	};
	const stepTypeVariants = {
		training: 'info',
		paperwork: 'warning',
		checkbox: 'secondary'
	} as const;

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
	const selectedTemplateLabel = $derived(
		templateOptions.find((option) => option.value === selectedTemplateId)?.label ?? 'All Templates'
	);
</script>

<Modal title="Onboarding Report" {onClose} width="720px" titleId="onboarding-report-title">
	<div class="flex flex-col gap-3">
		<div class="rounded-lg border bg-muted/35 p-3">
			<p class="m-0 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
				Readiness report
			</p>
			<h3 class="mt-1 mb-0 text-lg leading-tight font-semibold tracking-tight">
				See which onboarding steps are still holding people up.
			</h3>
			<p class="mt-2 mb-0 text-sm leading-relaxed text-muted-foreground">
				Review the current bottlenecks across active onboarding packets and narrow the list to a specific template when
				needed.
			</p>
		</div>

		<div class="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-end sm:justify-between">
			<div class="grid gap-1">
				<span class="font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
					Active packets
				</span>
				<strong class="text-2xl leading-none font-semibold tracking-tight">{filteredOnboardings.length}</strong>
			</div>
			{#if templateOptions.length > 1}
				<div class="grid w-full gap-2 sm:max-w-64">
					<Label for="onboarding-report-template">Template</Label>
					<Select.Root type="single" bind:value={selectedTemplateId}>
						<Select.Trigger id="onboarding-report-template" class="w-full">{selectedTemplateLabel}</Select.Trigger>
						<Select.Content>
							{#each templateOptions as opt (opt.value)}
								<Select.Item value={opt.value} label={opt.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{/if}
		</div>

		{#if report.length === 0}
			<Empty.Root>
				<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
				<Empty.Header>
					<Empty.Title>No active onboardings</Empty.Title>
					<Empty.Description>No active onboardings to report on.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<div class="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
				{#each report as step (step.key)}
					{@const completedCount = step.totalPeople - step.incomplete.length}
					<div
						class={step.incomplete.length === 0
							? 'rounded-lg border bg-success-muted/50 p-3'
							: 'rounded-lg border bg-card p-3'}
					>
						<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
							<div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
								<Badge variant={stepTypeVariants[step.stepType as keyof typeof stepTypeVariants] ?? 'secondary'}>
									{stepTypeLabels[step.stepType]}
								</Badge>
								<span class="text-sm leading-snug font-semibold">
									{step.stepName}
									{#if step.trainingTypeName && step.trainingTypeName !== step.stepName}
										<span class="font-normal text-muted-foreground">({step.trainingTypeName})</span>
									{/if}
								</span>
							</div>
							<span
								class={step.incomplete.length === 0
									? 'font-mono text-xs font-semibold tracking-[0.08em] text-success'
									: 'font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground'}
								>{completedCount}/{step.totalPeople}</span
							>
						</div>

						{#if step.incomplete.length > 0}
							<div class="mt-2 grid gap-2 border-t pt-2">
								{#each step.incomplete as person (person.key)}
									<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
										<span class="text-sm">{getPersonName(person.personnelId)}</span>
										{#if person.detail}
											<span class="font-mono text-xs text-muted-foreground">Current stage: {person.detail}</span>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<p class="mt-2 mb-0 text-sm leading-relaxed text-muted-foreground">
								Every active packet has cleared this step.
							</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<div class="spacer"></div>
		<Button variant="outline" type="button" onclick={onClose}>Close</Button>
	{/snippet}
</Modal>
