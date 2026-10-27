<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import type { SetupBranch } from './branch';
	import { SETUP_STEPS } from './registry';
	import SetupStepFooter from './SetupStepFooter.svelte';
	import { getSetupFlow } from './setupFlow.svelte';

	/** `custom` is the Mixed or joint unit: every military service's ranks stay active. */
	const BRANCHES: { value: SetupBranch; label: string }[] = [
		{ value: 'army', label: 'Army' },
		{ value: 'navy', label: 'Navy' },
		{ value: 'air-force', label: 'Air Force' },
		{ value: 'marine-corps', label: 'Marine Corps' },
		{ value: 'coast-guard', label: 'Coast Guard' },
		{ value: 'space-force', label: 'Space Force' },
		{ value: 'custom', label: 'Mixed or joint' }
	];
	const EVERY_UNIT = [
		{ title: 'Dashboard', pitch: 'Who is here, who is out and what needs you today.' },
		{ title: 'Calendar', pitch: 'Statuses and duty assignments for every person, every day.' },
		{ title: 'Personnel', pitch: 'Your roster, sorted into Groups, with ranks and records.' }
	];
	const FEATURES = SETUP_STEPS.filter((step) => step.group === 'features');

	const flow = getSetupFlow();
	const id = $props.id();
	const orgName = $derived(String(page.data.orgName ?? ''));

	let saving = $state<SetupBranch | null>(null);
	let failure = $state<string | null>(null);
	let saved = $state(false);
	/** The facts read before the last save; their rank count predates it. */
	let staleFacts = $state.raw<typeof flow.facts>(null);

	const chosen = $derived(saving ?? flow.state.branch);
	const chosenLabel = $derived(BRANCHES.find((branch) => branch.value === flow.state.branch)?.label);
	const activeRanks = $derived(
		flow.facts !== staleFacts && flow.facts?.activeRanks.status === 'ready' ? flow.facts.activeRanks.value : null
	);

	async function choose(branch: SetupBranch) {
		if (saving || branch === flow.state.branch) return;
		saving = branch;
		failure = null;
		try {
			if (!(await flow.saveBranch(branch))) return;
			staleFacts = flow.facts;
			saved = true;
			saving = null;
			await invalidate('app:organization-setup');
		} catch (cause) {
			saving = null;
			failure = cause instanceof Error && cause.message ? cause.message : 'Try again.';
		}
	}
</script>

<div class="flex flex-col gap-10">
	<p class="font-heading text-2xl leading-7 font-bold uppercase lg:text-[32px] lg:leading-9">
		<span class="sr-only">Unit:</span>
		{orgName}
		<a
			class="ml-2 align-middle font-sans text-sm font-normal tracking-normal normal-case underline underline-offset-4"
			href="{flow.dashboardHref}/settings/general"
		>
			Rename <span class="sr-only">the unit</span> in Settings
		</a>
	</p>

	<section class="grid gap-3" aria-labelledby="{id}-branch" aria-describedby="{id}-hint">
		<h2 id="{id}-branch" class="font-heading text-2xl leading-7 font-bold">Which service is your unit?</h2>
		<p id="{id}-hint" class="text-sm leading-5 text-muted-foreground">
			This sets your starting ranks. Mixed or joint units get every service's ranks.
		</p>
		<div class="flex flex-wrap gap-2" role="group" aria-labelledby="{id}-branch">
			{#each BRANCHES as branch (branch.value)}
				{@const pressed = chosen === branch.value}
				<Button
					variant={pressed ? 'default' : 'outline'}
					size="lg"
					class="text-base"
					aria-pressed={pressed}
					aria-busy={saving === branch.value || undefined}
					disabled={saving !== null && !pressed}
					onclick={() => choose(branch.value)}
				>
					{branch.label}
					{#if saving === branch.value}
						<Spinner data-icon="inline-end" aria-label="Saving" />
					{/if}
				</Button>
			{/each}
		</div>
		<div class="min-h-5 text-sm leading-5">
			{#if failure}
				<p role="alert" class="text-destructive-text">Couldn't save the service. {failure}</p>
			{:else if saved && chosenLabel && saving === null}
				{@const count = activeRanks === null ? '' : ` (${activeRanks} active ranks)`}
				<p role="status">
					{flow.state.branch === 'custom'
						? `Saved. Every service's ranks are active${count}.`
						: `Saved. ${chosenLabel} ranks are active${count}; other services' ranks are retired and can be restored.`}
					<a class="underline underline-offset-4" href={flow.href('ranks')}>Review them in Ranks</a>
				</p>
			{/if}
		</div>
	</section>

	<section class="grid gap-4" aria-labelledby="{id}-tour">
		<h2 id="{id}-tour" class="font-heading text-2xl leading-7 font-bold">What TroopToTask does</h2>
		<div class="grid gap-8 lg:grid-cols-2 lg:gap-10">
			{@render column('Every unit', 'Set up in the next four steps', EVERY_UNIT)}
			{@render column('You choose', 'Use it, leave it for later, or turn it off', FEATURES)}
		</div>
	</section>
</div>

{#snippet column(label: string, detail: string, rows: readonly { title: string; pitch: string }[])}
	<div>
		<p class="flex flex-wrap items-baseline gap-x-2.5 border-b-2 border-foreground pb-2.5">
			<span class="font-mono text-[11px] font-medium tracking-[0.08em] uppercase">{label}</span>
			<span class="text-sm text-muted-foreground">{detail}</span>
		</p>
		<dl>
			{#each rows as row (row.title)}
				<div class="grid gap-1 border-b py-2.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
					<dt class="text-base font-semibold">{row.title}</dt>
					<dd class="text-sm leading-5">{row.pitch}</dd>
				</div>
			{/each}
		</dl>
	</div>
{/snippet}

<SetupStepFooter
	blocked={saving ? 'Saving the service…' : flow.state.branch ? null : 'Choose a service to continue'}
	note="Branch and ranks can change later"
	continueLabel={flow.next ? `Start with ${flow.next.title}` : undefined}
/>
