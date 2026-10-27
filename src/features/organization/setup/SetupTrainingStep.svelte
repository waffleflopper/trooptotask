<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { getSetupStepSupport } from './featureStepSupport';
	import SetupFeaturePanel from './SetupFeaturePanel.svelte';
	import SetupFeatureStep from './SetupFeatureStep.svelte';
	import { getSetupFlow } from './setupFlow.svelte';

	/** Rows shown at phone width before "Show N more". */
	const NARROW_ROWS = 3;

	type Catalog = { state: 'loading' } | { state: 'ready'; names: Set<string> } | { state: 'failed'; message: string };

	const flow = getSetupFlow();
	const support = getSetupStepSupport();
	const canConfigure = $derived(
		support.access.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.configureRequirements).allowed
	);
	const branch = $derived(flow.state.branch);
	const suggestions = $derived(canConfigure && branch ? support.trainingSuggestions(branch) : []);
	const typesHref = $derived(`${flow.dashboardHref}/training/types`);

	let catalog = $state.raw<Catalog>({ state: 'loading' });
	const picked = new SvelteSet<string>(untrack(() => suggestions.map((suggestion) => suggestion.id)));
	let expanded = $state(false);

	const added = (name: string) => catalog.state === 'ready' && catalog.names.has(name);
	const open = $derived(suggestions.filter((suggestion) => !added(suggestion.name)));
	const toAdd = $derived(open.filter((suggestion) => picked.has(suggestion.id)));
	const rows = $derived(Math.ceil(suggestions.length / 2));

	let loads = 0;
	async function loadCatalog() {
		const load = ++loads;
		catalog = { state: 'loading' };
		try {
			const response = await fetch(`${flow.dashboardHref}/api/training-types`);
			if (!response.ok) throw new Error(`Training types could not be loaded (${response.status}).`);
			const types: { name: string }[] = await response.json();
			if (load === loads) catalog = { state: 'ready', names: new Set(types.map((type) => type.name)) };
		} catch (cause) {
			if (load === loads) catalog = { state: 'failed', message: (cause as Error).message };
		}
	}

	$effect(() => {
		if (suggestions.length > 0) untrack(loadCatalog);
	});

	async function save() {
		if (!branch) return;
		const result = await flow.addTrainingSuggestions(
			branch,
			toAdd.map((suggestion) => suggestion.id)
		);
		if (!result) return;
		catalog = { state: 'ready', names: new Set(result.trainingTypes.map((type) => type.name)) };
		if (result.failed.length > 0) {
			throw new Error(`${result.failed.map((item) => item.name).join(', ')} could not be added. Try again.`);
		}
	}

	const plural = (n: number) => `${n} training type${n === 1 ? '' : 's'}`;
	const footer = $derived(
		toAdd.length > 0
			? {
					save,
					continueLabel: `Add ${toAdd.length} and continue`,
					note: `Adds ${plural(toAdd.length)}`,
					blocked: catalog.state === 'loading' ? 'Checking your training types' : null
				}
			: { blocked: suggestions.length > 0 && catalog.state === 'loading' ? 'Checking your training types' : null }
	);
</script>

<SetupFeatureStep
	setUpHint={suggestions.length > 0
		? 'Add the training your unit tracks. Start from the common Army list below.'
		: 'Add the training your unit tracks on the Training types page.'}
	laterHint="Training stays on, empty. Owners and admins see a reminder on the Dashboard until it has a type."
	{footer}
>
	{#snippet setUp()}
		{#if !canConfigure}
			<p class="text-sm leading-5 text-muted-foreground">
				Adding training types needs Training configure access. The owner can add them, or change your access in Settings
				› Members.
			</p>
		{:else if suggestions.length === 0}
			<SetupFeaturePanel title="Training types">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
					<p class="flex-1 text-sm leading-5 text-muted-foreground">
						Add each requirement your unit tracks, with how often it renews. Have records in a spreadsheet? Import them
						once the types exist.
					</p>
					<Button variant="outline" href={typesHref}>Open Training types</Button>
				</div>
			</SetupFeaturePanel>
		{:else}
			<SetupFeaturePanel title="Common Army annual training">
				{#snippet aside()}
					<span
						class="hidden font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase sm:inline"
						aria-live="polite"
					>
						{#if catalog.state === 'loading'}
							<Skeleton class="inline-block h-3.5 w-28 align-middle" aria-hidden="true" />
							<span class="sr-only">Checking your training types</span>
						{:else if open.length === 0}
							All added
						{:else}
							{toAdd.length} of {open.length} selected
						{/if}
					</span>
				{/snippet}
				{#if catalog.state === 'failed'}
					<p role="alert" class="text-sm leading-5 text-destructive-text">
						{catalog.message} Types that already exist are skipped when you add.
						<Button variant="link" class="h-auto p-0 align-baseline" onclick={loadCatalog}>Retry</Button>
					</p>
				{/if}
				<ul class="grid gap-x-8 sm:grid-flow-col sm:grid-cols-2" style:grid-template-rows="repeat({rows}, auto)">
					{#each suggestions as suggestion, index (suggestion.id)}
						{@const exists = added(suggestion.name)}
						<li class={index >= NARROW_ROWS && !expanded ? 'max-sm:hidden' : undefined}>
							<label
								class="flex h-10 cursor-pointer items-center gap-2.5 border-b border-border has-disabled:cursor-default"
							>
								<Checkbox
									checked={exists || picked.has(suggestion.id)}
									disabled={exists}
									onCheckedChange={(checked) => (checked ? picked.add(suggestion.id) : picked.delete(suggestion.id))}
								/>
								<span
									class="min-w-0 flex-1 truncate text-sm leading-5 {exists || picked.has(suggestion.id)
										? ''
										: 'text-muted-foreground'}"
								>
									{suggestion.name}
								</span>
								<span class="shrink-0 font-mono text-xs leading-4 text-muted-foreground">
									{exists ? 'Added' : `${suggestion.expirationMonths} mo`}
								</span>
							</label>
						</li>
					{/each}
				</ul>
				{#if !expanded && suggestions.length > NARROW_ROWS}
					<Button
						variant="link"
						class="h-auto self-start p-0 text-foreground underline sm:hidden"
						onclick={() => (expanded = true)}
					>
						Show {suggestions.length - NARROW_ROWS} more
					</Button>
				{/if}
				<div class="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:gap-5">
					<p class="flex-1 text-sm leading-5 text-muted-foreground">
						Periods and colors can be changed on the Training types page. Have records in a spreadsheet? Import them
						once the types exist.
					</p>
					<a href={typesHref} class="shrink-0 text-sm leading-5 underline underline-offset-2">Add your own type</a>
				</div>
			</SetupFeaturePanel>
		{/if}
	{/snippet}
</SetupFeatureStep>
