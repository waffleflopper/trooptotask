<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import type { PersonnelOnboarding } from '../onboarding.types';
	import { SvelteSet } from 'svelte/reactivity';
	import { formatDisplayDate } from '$lib/utils/dates';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import OnboardingStepRow from './OnboardingStepRow.svelte';

	interface Props {
		ctx: OnboardingPageContext;
		onboarding: PersonnelOnboarding;
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}

	let { ctx, onboarding, open = $bindable(), onOpenChange }: Props = $props();

	let completedSectionOpen = $state(false);
	let expandedCompletedSteps = new SvelteSet<string>();

	function toggleCompletedStep(stepId: string) {
		if (expandedCompletedSteps.has(stepId)) expandedCompletedSteps.delete(stepId);
		else expandedCompletedSteps.add(stepId);
	}

	const canManage = $derived(ctx.canManageOnboarding(onboarding) && onboarding.status === 'in_progress');

	const activeSteps = $derived(onboarding.steps.filter((s) => s.active && !s.completed));
	const inactiveSteps = $derived(onboarding.steps.filter((s) => !s.active));
	const completedSteps = $derived(onboarding.steps.filter((s) => s.active && s.completed));
	const progress = $derived(ctx.getProgress(onboarding));
	const pct = $derived(progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0);
	const groupName = $derived(ctx.getPersonGroupName(onboarding.personnelId));
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content side="right" class="sm:max-w-md" showCloseButton={true}>
		<Sheet.Header class="border-b border-border pb-3">
			<Sheet.Title>{ctx.getPersonName(onboarding.personnelId)}</Sheet.Title>
			<Sheet.Description>
				<span class="flex flex-wrap items-center gap-2">
					<Badge variant="secondary">{ctx.getTemplateName(onboarding.templateId)}</Badge>
					{#if groupName}
						<Badge variant="outline">{groupName}</Badge>
					{/if}
					<span class="font-mono text-[10px] uppercase tracking-wider">
						Started {formatDisplayDate(onboarding.startedAt)}
					</span>
				</span>
			</Sheet.Description>
			<div class="mt-3 flex items-center gap-3">
				<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
					<div class="h-full rounded-full bg-primary transition-all" style="width: {pct}%"></div>
				</div>
				<span class="font-mono text-xs font-medium text-muted-foreground">
					{progress.completed}/{progress.total}
				</span>
			</div>
		</Sheet.Header>

		{#if canManage}
			<div class="flex flex-wrap gap-2 border-b border-border px-4 pb-3">
				<Button size="sm" onclick={() => ctx.promptCompleteOnboarding(onboarding.id)}>Mark Complete</Button>
				<Button
					size="sm"
					variant="outline"
					onclick={() => ctx.handleResync(onboarding.id)}
					disabled={ctx.resyncingId === onboarding.id}
				>
					{#if ctx.resyncingId === onboarding.id}<Spinner />{/if}
					Re-sync
				</Button>
				{#if onboarding.templateId === null}
					<Button size="sm" variant="outline" onclick={() => ctx.openAssignTemplate(onboarding.id)}>
						Assign Template
					</Button>
				{:else if ctx.canManageConfig}
					<Button size="sm" variant="outline" onclick={() => ctx.openSwitchTemplate(onboarding.id)}>
						Switch Template
					</Button>
				{/if}
				<Button size="sm" variant="destructive" onclick={() => (ctx.cancellingId = onboarding.id)}>Cancel</Button>
			</div>
		{/if}

		<div class="flex-1 overflow-y-auto px-4 py-3">
			<div class="flex flex-col gap-2">
				{#each activeSteps as step (step.id)}
					<OnboardingStepRow {step} mode="active" {canManage} {ctx} />
				{/each}

				{#each inactiveSteps as step (step.id)}
					<OnboardingStepRow {step} mode="inactive" {canManage} {ctx} />
				{/each}

				{#if completedSteps.length > 0}
					<div class="mt-2 rounded-lg border border-border/60">
						<button
							onclick={() => (completedSectionOpen = !completedSectionOpen)}
							class="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
						>
							<ChevronDown
								class="h-3.5 w-3.5 text-muted-foreground transition-transform {completedSectionOpen
									? ''
									: '-rotate-90'}"
							/>
							<span class="flex-1 text-sm font-medium text-muted-foreground">Completed</span>
							<span
								class="flex h-5 min-w-5 items-center justify-center rounded-full bg-success/10 px-1.5 font-mono text-[10px] font-semibold text-success"
							>
								{completedSteps.length}
							</span>
						</button>

						{#if completedSectionOpen}
							<div class="flex flex-col gap-1.5 border-t border-border/40 p-2">
								{#each completedSteps as step (step.id)}
									<OnboardingStepRow
										{step}
										mode="completed"
										{canManage}
										{ctx}
										expanded={expandedCompletedSteps.has(step.id)}
										onToggleExpand={() => toggleCompletedStep(step.id)}
									/>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
