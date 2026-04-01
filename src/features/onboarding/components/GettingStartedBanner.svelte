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
			<div class="getting-started-heading">
				<p class="getting-started-kicker">Setup Checklist</p>
				<h3>Stand up the workspace.</h3>
				<p class="getting-started-subtitle">
					Complete these tasks to make the dashboard, calendar, and records useful on day one.
				</p>
			</div>
			{#if confirmingDismiss}
				<div class="dismiss-confirm">
					<span>Hide checklist?</span>
					<button class="btn btn-sm btn-secondary" onclick={() => (confirmingDismiss = false)}>No</button>
					<button class="btn btn-sm btn-amber" onclick={handleDismiss}>Yes</button>
				</div>
			{:else}
				<button class="dismiss-btn" onclick={handleDismiss} aria-label="Dismiss getting started checklist">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
				</button>
			{/if}
		</div>

		<div class="progress-section">
			<div class="progress-summary">
				<span class="progress-value">{completedCount}/{steps.length}</span>
				<span class="progress-text">complete</span>
			</div>
			<div class="progress-bar" aria-hidden="true">
				<div class="progress-fill" style="width: {progressPct}%"></div>
			</div>
		</div>

		<ul class="step-list" aria-label="Organization setup checklist">
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
					<div class="step-copy">
						<span class="step-label">{step.label}</span>
						<span class="step-state">{step.complete ? 'Complete' : 'Pending'}</span>
					</div>
					{#if !step.complete}
						<a href={step.link} class="step-link">Open</a>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}

<style>
	.getting-started {
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		padding: clamp(var(--sp-5), 2vw, var(--sp-6));
		margin-bottom: var(--spacing-lg);
		box-shadow: var(--shadow-sm);
	}

	.getting-started-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.getting-started-heading {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.getting-started-kicker {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--amber);
	}

	.getting-started-header h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.6rem, 1.4rem + 0.8vw, 2.2rem);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.05em;
		line-height: 0.95;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.getting-started-subtitle {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		line-height: 1.55;
		margin: 0;
		max-width: 52rem;
	}

	.dismiss-btn {
		background: transparent;
		border: 1px solid var(--border-default);
		cursor: pointer;
		padding: var(--spacing-xs);
		color: var(--text-tertiary);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.dismiss-btn:hover {
		color: var(--text-primary);
		background: var(--surface-subtle);
	}

	.dismiss-confirm {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
		font-size: var(--text-sm);
		color: var(--text-secondary);
		justify-content: flex-end;
	}

	.progress-section {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--spacing-md);
		align-items: center;
		padding: var(--spacing-md) 0;
		border-top: var(--border-rule);
		border-bottom: var(--border-rule);
		margin-bottom: var(--spacing-lg);
	}

	.progress-summary {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-xs);
		flex-shrink: 0;
	}

	.progress-value {
		font-family: var(--font-display);
		font-size: clamp(1.8rem, 1.5rem + 1vw, 2.5rem);
		font-weight: var(--font-weight-display);
		line-height: 0.95;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.step-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--spacing-sm);
	}

	.step {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: 0.8rem 0.9rem;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
		font-size: var(--text-sm);
	}

	.step.complete {
		background: color-mix(in srgb, var(--surface-panel) 82%, var(--success-bg) 18%);
	}

	.step-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.step-copy {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.step-label {
		color: var(--text-primary);
		font-weight: var(--font-weight-medium);
	}

	.step.complete .step-label {
		color: var(--text-secondary);
	}

	.step-state,
	.progress-text {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.step-link {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--amber-dark);
		text-decoration: none;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.step-link:hover {
		color: var(--amber);
	}

	.progress-bar {
		flex: 1;
		height: 8px;
		background: var(--surface-subtle);
		border-radius: 999px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--amber);
		border-radius: 999px;
		transition: width 0.3s ease;
	}

	@media (max-width: 720px) {
		.step-list {
			grid-template-columns: 1fr;
		}

		.progress-section {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.getting-started-header {
			flex-direction: column;
		}

		.dismiss-confirm {
			justify-content: flex-start;
		}
	}
</style>
