<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidate } from '$app/navigation';
	import { Pencil } from '@lucide/svelte';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { getSetupStepSupport, type SetupTrainingTypeCatalog } from './featureStepSupport';
	import SetupFeaturePanel from './SetupFeaturePanel.svelte';
	import SetupFeatureStep from './SetupFeatureStep.svelte';
	import SetupSuggestionPanel from './SetupSuggestionPanel.svelte';
	import { getSetupFlow } from './setupFlow.svelte';

	type Catalog =
		| { state: 'loading' }
		| { state: 'ready'; catalog: SetupTrainingTypeCatalog }
		| { state: 'failed'; message: string };

	const flow = getSetupFlow();
	const support = getSetupStepSupport();
	const Editor = support.trainingTypes.Editor;
	const canConfigure = $derived(
		support.access.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.configureRequirements).allowed
	);
	const branch = $derived(flow.state.branch);
	const suggestions = $derived(canConfigure && branch ? support.trainingSuggestions(branch) : []);

	let catalog = $state.raw<Catalog>({ state: 'loading' });
	const unpicked = new SvelteSet<string>();
	let editing = $state<{ typeId: string | null } | null>(null);

	const types = $derived(catalog.state === 'ready' ? catalog.catalog.trainingTypes : []);
	const added = (name: string) => types.some((type) => type.name === name);
	const open = $derived(suggestions.filter((suggestion) => !added(suggestion.name)));
	const toAdd = $derived(open.filter((suggestion) => !unpicked.has(suggestion.id)));
	const ownTypes = $derived(types.filter((type) => !suggestions.some((suggestion) => suggestion.name === type.name)));

	let loads = 0;
	async function loadCatalog({ quiet = false } = {}) {
		const load = ++loads;
		if (!quiet) catalog = { state: 'loading' };
		try {
			const loaded = await support.trainingTypes.load();
			if (load === loads) catalog = { state: 'ready', catalog: loaded };
		} catch (cause) {
			if (load === loads) catalog = { state: 'failed', message: (cause as Error).message };
		}
	}

	$effect(() => {
		if (canConfigure) untrack(() => loadCatalog());
	});

	async function changed() {
		editing = null;
		// A new type can make the step Done from data, which the rail reads from the reloaded facts.
		await Promise.all([loadCatalog({ quiet: true }), invalidate('app:organization-setup')]);
	}

	async function save() {
		if (!branch) return;
		const result = await flow.addTrainingSuggestions(
			branch,
			toAdd.map((suggestion) => suggestion.id)
		);
		if (!result) return;
		if (catalog.state === 'ready') {
			catalog = { state: 'ready', catalog: { ...catalog.catalog, trainingTypes: result.trainingTypes } };
		}
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

{#snippet loadError()}
	{#if catalog.state === 'failed'}
		<p role="alert" class="text-sm leading-5 text-destructive-text">
			{catalog.message}
			{#if suggestions.length > 0}Types that already exist are skipped when you add.{/if}
			<Button variant="link" class="h-auto p-0 align-baseline" onclick={() => loadCatalog()}>Retry</Button>
		</p>
	{/if}
{/snippet}

{#snippet typeRows(list: typeof types)}
	<ul>
		{#each list as type (type.id)}
			<li>
				<button
					type="button"
					class="group flex h-10 w-full cursor-pointer items-center gap-2.5 border-b border-border text-start outline-none"
					onclick={() => (editing = { typeId: type.id })}
				>
					<Pencil class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span class="min-w-0 flex-1 truncate text-sm leading-5 group-hover:underline group-focus-visible:underline">
						{type.name}
					</span>
					<span class="shrink-0 font-mono text-xs leading-4 text-muted-foreground">
						{type.expirationMonths ? `${type.expirationMonths} mo` : '—'}
					</span>
				</button>
			</li>
		{/each}
	</ul>
{/snippet}

<SetupFeatureStep
	setUpHint={suggestions.length > 0
		? 'Add the training your unit tracks. Start from the common Army list below.'
		: 'Add the training your unit tracks, with how often each renews.'}
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
				{@render loadError()}
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
					<p class="flex-1 text-sm leading-5 text-muted-foreground">
						Add each requirement your unit tracks, with how often it renews. Have records in a spreadsheet? Import them
						once the types exist.
					</p>
					<Button
						variant="outline"
						class="self-start sm:self-auto"
						disabled={catalog.state !== 'ready'}
						onclick={() => (editing = { typeId: null })}
					>
						Add a type
					</Button>
				</div>
				{#if catalog.state === 'loading'}
					<div role="status" aria-label="Loading training types">
						{#each { length: 2 }, index (index)}
							<div class="flex h-10 items-center gap-2.5 border-b border-border">
								<Skeleton class="size-4" />
								<Skeleton class="h-4 w-40" />
							</div>
						{/each}
					</div>
				{:else}
					{@render typeRows(types)}
				{/if}
			</SetupFeaturePanel>
		{:else}
			<SetupSuggestionPanel
				title="Common Army annual training"
				{suggestions}
				{unpicked}
				added={(suggestion) => added(suggestion.name)}
				loading={catalog.state === 'loading'}
				loadingLabel="Checking your training types"
				notice={loadError}
			>
				{#snippet detail(suggestion, exists)}
					<span class="shrink-0 font-mono text-xs leading-4 text-muted-foreground">
						{exists ? 'Added' : `${suggestion.expirationMonths} mo`}
					</span>
				{/snippet}
				<div class="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:gap-5">
					<p class="flex-1 text-sm leading-5 text-muted-foreground">
						Periods and colors can be changed on the Training types page. Have records in a spreadsheet? Import them
						once the types exist.
					</p>
					<Button
						variant="link"
						class="h-auto shrink-0 self-start p-0 text-sm leading-5 text-foreground underline underline-offset-2 sm:self-auto"
						disabled={catalog.state !== 'ready'}
						onclick={() => (editing = { typeId: null })}
					>
						Add your own type
					</Button>
				</div>
				{#if ownTypes.length > 0}
					<div class="flex flex-col gap-1.5">
						<p
							class="font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
						>
							Your own types
						</p>
						{@render typeRows(ownTypes)}
					</div>
				{/if}
			</SetupSuggestionPanel>
		{/if}
	{/snippet}
</SetupFeatureStep>

{#if editing && catalog.state === 'ready'}
	<Editor catalog={catalog.catalog} typeId={editing.typeId} onChanged={changed} onClose={() => (editing = null)} />
{/if}
