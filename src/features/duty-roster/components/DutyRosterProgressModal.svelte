<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	interface Props {
		mode: 'preview' | 'refresh' | 'apply';
		eventCount?: number;
	}

	let { mode, eventCount = 0 }: Props = $props();
	let activeStepIndex = $state(0);
	let dotCount = $state(1);

	const steps = $derived.by(() => {
		if (mode === 'apply') {
			return ['Checking coverage conflicts', 'Saving duty events', 'Updating roster history', 'Refreshing calendar'];
		}
		if (mode === 'refresh') {
			return ['Reviewing manual changes', 'Rebuilding slot assignments', 'Checking coverage conflicts'];
		}
		return [
			'Collecting eligible personnel',
			'Applying exemptions',
			'Analyzing previous duties',
			'Checking coverage conflicts'
		];
	});
	const title = $derived(
		mode === 'apply' ? 'Applying duty roster' : mode === 'refresh' ? 'Refreshing duty roster' : 'Generating duty roster'
	);
	const summary = $derived(
		mode === 'apply'
			? eventCount > 0
				? `Saving ${eventCount} duty event${eventCount === 1 ? '' : 's'}.`
				: 'Saving duty events.'
			: eventCount > 0
				? `Building ${eventCount} duty event${eventCount === 1 ? '' : 's'}.`
				: 'Building the duty roster.'
	);
	const activeStep = $derived(`${steps[activeStepIndex] ?? steps[0]}${'.'.repeat(dotCount)}`);
	const progressPercent = $derived((((activeStepIndex + 1) / steps.length) * 100).toFixed(2));

	$effect(() => {
		activeStepIndex = 0;
		dotCount = 1;

		const stepTimer = window.setInterval(() => {
			activeStepIndex = (activeStepIndex + 1) % steps.length;
		}, 1400);
		const dotTimer = window.setInterval(() => {
			dotCount = dotCount === 3 ? 1 : dotCount + 1;
		}, 450);

		return () => {
			window.clearInterval(stepTimer);
			window.clearInterval(dotTimer);
		};
	});
</script>

<Modal
	{title}
	onClose={() => {}}
	width="440px"
	titleId="duty-roster-progress-title"
	canClose={false}
	showCloseButton={false}
>
	<div class="progress-shell" role="status" aria-live="polite" aria-atomic="true">
		<div class="progress-head">
			<Spinner size={24} color="var(--color-primary)" />
			<div>
				<p class="progress-summary">{summary}</p>
				<p class="progress-step">{activeStep}</p>
			</div>
		</div>
		<div class="progress-track" role="progressbar" aria-valuetext={activeStep}>
			<div class="progress-fill" style:width={`${progressPercent}%`}></div>
		</div>
		<ol class="progress-steps">
			{#each steps as step, index (step)}
				<li class:active={index === activeStepIndex} class:done={index < activeStepIndex}>{step}</li>
			{/each}
		</ol>
	</div>
</Modal>

<style>
	.progress-shell {
		display: grid;
		gap: var(--sp-4);
	}

	.progress-head {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
	}

	.progress-summary,
	.progress-step {
		margin: 0;
	}

	.progress-summary {
		color: var(--text-primary);
		font-weight: var(--font-weight-semibold);
	}

	.progress-step {
		margin-top: var(--sp-1);
		color: var(--text-secondary);
	}

	.progress-track {
		overflow: hidden;
		height: 8px;
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
	}

	.progress-fill {
		height: 100%;
		border-radius: inherit;
		background: var(--color-primary);
		transition: width 280ms ease;
	}

	.progress-steps {
		display: grid;
		gap: var(--sp-2);
		margin: 0;
		padding-left: var(--sp-5);
		color: var(--text-tertiary);
		font-size: var(--text-sm);
	}

	.progress-steps li {
		padding-left: var(--sp-1);
	}

	.progress-steps li.active {
		color: var(--text-primary);
		font-weight: var(--font-weight-semibold);
	}

	.progress-steps li.done {
		color: var(--text-secondary);
	}
</style>
