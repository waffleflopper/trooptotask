<script lang="ts">
	import { browser } from '$app/environment';
	import { toastStore } from '$lib/stores/toast.svelte';

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

	let calendarVisited = $state(false);
	let confirmingDismiss = $state(false);
	let hasBeenVisible = $state(false);

	// Hydrate localStorage-based step
	$effect(() => {
		if (browser) {
			calendarVisited = localStorage.getItem(`gettingStarted_calendarVisited_${orgId}`) === 'true';
		}
	});

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
			label: 'Set up your onboarding flow',
			complete: onboardingTemplateStepCount > 0,
			link: `/org/${orgId}/onboarding`
		},
		{ label: 'Configure your rating scheme', complete: ratingSchemeEntryCount > 0, link: `/org/${orgId}/personnel` },
		{ label: 'Invite a team member', complete: orgMemberCount > 1, link: `/org/${orgId}/settings` },
		{ label: 'Explore the calendar', complete: calendarVisited, link: `/org/${orgId}/calendar` }
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
	<div class="getting-started">
		<div class="getting-started-header">
			<h3>Getting Started</h3>
			{#if confirmingDismiss}
				<div class="dismiss-confirm">
					<span>Hide checklist?</span>
					<button class="btn btn-sm btn-secondary" onclick={() => (confirmingDismiss = false)}>No</button>
					<button class="btn btn-sm btn-primary" onclick={handleDismiss}>Yes</button>
				</div>
			{:else}
				<button class="dismiss-btn" onclick={handleDismiss} aria-label="Dismiss getting started checklist">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
				</button>
			{/if}
		</div>
		<p class="getting-started-subtitle">Complete these steps to set up your organization</p>

		<ul class="step-list">
			{#each steps as step (step.label)}
				<li class="step" class:complete={step.complete}>
					<span class="step-icon">
						{#if step.complete}
							<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
								<circle cx="9" cy="9" r="9" fill="var(--color-success)" />
								<path
									d="M5 9L8 12L13 6"
									stroke="white"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						{:else}
							<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
								<circle cx="9" cy="9" r="8" stroke="var(--color-border)" stroke-width="2" />
							</svg>
						{/if}
					</span>
					<span class="step-label">{step.label}</span>
					{#if !step.complete}
						<a href={step.link} class="step-link">Go &rarr;</a>
					{/if}
				</li>
			{/each}
		</ul>

		<div class="progress-section">
			<div class="progress-bar">
				<div class="progress-fill" style="width: {progressPct}%"></div>
			</div>
			<span class="progress-text">{completedCount} of {steps.length} complete</span>
		</div>
	</div>
{/if}

<style>
	.getting-started {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
	}

	.getting-started-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-xs);
	}

	.getting-started-header h3 {
		margin: 0;
		font-size: var(--font-size-lg);
	}

	.getting-started-subtitle {
		color: var(--color-text-secondary);
		font-size: var(--font-size-sm);
		margin: 0 0 var(--spacing-md);
	}

	.dismiss-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: var(--spacing-xs);
		color: var(--color-text-muted);
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
	}

	.dismiss-btn:hover {
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.dismiss-confirm {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.step-list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--spacing-md);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.step {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-base);
	}

	.step.complete .step-label {
		color: var(--color-text-muted);
	}

	.step-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.step-label {
		flex: 1;
	}

	.step-link {
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		text-decoration: none;
		white-space: nowrap;
	}

	.step-link:hover {
		text-decoration: underline;
	}

	.progress-section {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.progress-bar {
		flex: 1;
		height: 6px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--color-success);
		border-radius: var(--radius-full);
		transition: width 0.3s ease;
	}

	.progress-text {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		white-space: nowrap;
	}
</style>
