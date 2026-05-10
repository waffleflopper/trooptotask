<script lang="ts">
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import { toastStore } from '$lib/stores/toast.svelte';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import Circle from '@lucide/svelte/icons/circle';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		orgId: string;
		personnelCount: number;
		statusTypeCount: number;
		trainingTypeCount: number;
		assignmentTypeCount: number;
		onboardingTemplateStepCount: number;
		ratingSchemeEntryCount: number;
		orgMemberCount: number;
		dismissed: boolean;
		onDismiss: () => void;
	}

	let {
		orgId,
		personnelCount,
		statusTypeCount,
		trainingTypeCount,
		assignmentTypeCount,
		onboardingTemplateStepCount,
		ratingSchemeEntryCount,
		orgMemberCount,
		dismissed,
		onDismiss
	}: Props = $props();

	const calendarVisited = $derived(
		browser ? localStorage.getItem(`gettingStarted_calendarVisited_${orgId}`) === 'true' : false
	);
	let confirmingDismiss = $state(false);
	let hasBeenVisible = false;

	interface Step {
		label: string;
		complete: boolean;
		link: string;
	}

	const steps: Step[] = $derived([
		{ label: 'Add your first personnel', complete: personnelCount > 0, link: `/org/${orgId}/personnel` },
		{ label: 'Set up your status types', complete: statusTypeCount > 0, link: `/org/${orgId}/calendar` },
		{ label: 'Set up assignment types', complete: assignmentTypeCount > 0, link: `/org/${orgId}/calendar` },
		{ label: 'Configure training types', complete: trainingTypeCount > 0, link: `/org/${orgId}/training` },
		{
			label: 'Configure onboarding requirements',
			complete: onboardingTemplateStepCount > 0,
			link: `/org/${orgId}/onboarding`
		},
		{ label: 'Configure your rating scheme', complete: ratingSchemeEntryCount > 0, link: `/org/${orgId}/evals` },
		{ label: 'Invite a team member', complete: orgMemberCount > 1, link: `/org/${orgId}/settings` },
		{ label: 'Review the unit calendar', complete: calendarVisited, link: `/org/${orgId}/calendar` }
	]);

	const completedCount = $derived(steps.filter((s) => s.complete).length);
	const allComplete = $derived(completedCount === steps.length);
	const progressPct = $derived((completedCount / steps.length) * 100);

	// Track that the banner was actually rendered (prevents toast for established orgs)
	$effect(() => {
		if (!dismissed && !allComplete) {
			hasBeenVisible = true;
		}
	});

	// Auto-hide and toast when all complete (only if banner was visible this session)
	$effect(() => {
		if (allComplete && hasBeenVisible && !dismissed) {
			toastStore.success("You're all set! Your organization is configured.");
			onDismiss();
		}
	});

	async function handleDismiss() {
		if (!confirmingDismiss) {
			confirmingDismiss = true;
			return;
		}
		onDismiss();
	}
</script>

{#if !dismissed && !allComplete}
	<div class="mb-6 rounded-lg border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div class="grid min-w-0 gap-1.5">
				<p class="m-0 font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
					Setup Checklist
				</p>
				<h3 class="m-0 text-xl leading-tight font-semibold tracking-tight sm:text-2xl">Stand up the workspace.</h3>
				<p class="m-0 max-w-3xl text-sm leading-relaxed text-muted-foreground">
					Complete these tasks to make the dashboard, calendar, and records useful on day one.
				</p>
			</div>
			{#if confirmingDismiss}
				<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground sm:justify-end">
					<span>Hide checklist?</span>
					<Button size="sm" variant="outline" onclick={() => (confirmingDismiss = false)}>No</Button>
					<Button size="sm" onclick={handleDismiss}>Yes</Button>
				</div>
			{:else}
				<Button size="icon" variant="outline" onclick={handleDismiss} aria-label="Dismiss getting started checklist">
					<X />
				</Button>
			{/if}
		</div>

		<div class="mb-6 grid gap-3 border-y py-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
			<div class="flex items-baseline gap-1">
				<span class="text-2xl leading-none font-semibold tracking-tight">{completedCount}/{steps.length}</span>
				<span class="font-mono text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">complete</span>
			</div>
			<Progress value={progressPct} aria-label="Setup checklist progress" />
		</div>

		<ul class="grid gap-2 sm:grid-cols-2" aria-label="Organization setup checklist">
			{#each steps as step (step.label)}
				<li class="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-sm">
					<span class="flex shrink-0 items-center text-muted-foreground">
						{#if step.complete}
							<CheckCircle2 class="size-4 text-success" />
						{:else}
							<Circle class="size-4" />
						{/if}
					</span>
					<div class="min-w-0 flex-1">
						<span
							class={step.complete ? 'block truncate font-medium text-muted-foreground' : 'block truncate font-medium'}
						>
							{step.label}
						</span>
					</div>
					{#if !step.complete}
						<Button href={step.link} variant="link" size="sm" class="h-auto px-0">Open</Button>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
