<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { SetupBranch } from '$features/organization/contracts';
	import { SuggestionPanel } from '$lib/components/patterns/suggestion-panel';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { stillInOrganizationLifetime } from '$lib/stores/core';
	import type { TrainingPageAccess } from '../contracts';
	import { fetchTrainingSuggestionBranch, postTrainingSuggestions } from '../trainingSuggestionsClient';
	import { trainingTypesStore } from '../stores/trainingTypes.svelte';
	import { getTrainingSuggestions } from '../trainingSuggestions';

	let {
		org,
		onNewType
	}: {
		org: Pick<TrainingPageAccess, 'orgId'>;
		/** Opens the editor for a type of the viewer's own. */
		onNewType: (event: MouseEvent & { currentTarget: HTMLElement }) => void;
	} = $props();

	const normalize = (name: string) => name.trim().toLowerCase();

	type Lookup =
		| { state: 'loading' }
		| { state: 'ready'; branch: SetupBranch | null }
		| { state: 'failed'; message: string };
	let lookup = $state.raw<Lookup>({ state: 'loading' });
	const branch = $derived(lookup.state === 'ready' ? lookup.branch : null);
	let alive = true;
	onDestroy(() => {
		alive = false;
	});
	function lookUp(orgId: string) {
		lookup = { state: 'loading' };
		fetchTrainingSuggestionBranch(orgId).then(
			(found) => {
				if (alive && org.orgId === orgId) lookup = { state: 'ready', branch: found };
			},
			(cause) => {
				if (alive && org.orgId === orgId)
					lookup = {
						state: 'failed',
						message: cause instanceof Error ? cause.message : 'Could not check for starter training types.'
					};
			}
		);
	}
	$effect(() => {
		const orgId = org.orgId;
		untrack(() => lookUp(orgId));
	});

	const savedNames = $derived(new Set(trainingTypesStore.items.map((type) => normalize(type.name))));
	const open = $derived(getTrainingSuggestions(branch).filter(({ name }) => !savedNames.has(normalize(name))));
	const unpicked = new SvelteSet<string>();
	const toAdd = $derived(open.filter(({ id }) => !unpicked.has(id)));

	let saving = $state(false);
	let failure = $state<string | null>(null);

	async function add() {
		const orgId = org.orgId;
		if (!branch || saving || toAdd.length === 0) return;
		// The saved types belong in the shared store even when the page was left during the save, but never in a later visit.
		const inLifetime = stillInOrganizationLifetime();
		const sameOrg = () => inLifetime() && trainingTypesStore.orgId === orgId;
		const stillHere = () => alive && org.orgId === orgId;
		saving = true;
		failure = null;
		try {
			const result = await postTrainingSuggestions(orgId, {
				branch,
				suggestionIds: toAdd.map(({ id }) => id)
			});
			// The reply carries the catalog just read back, so the page keeps its place instead of reloading.
			if (sameOrg()) trainingTypesStore.load(result.trainingTypes, orgId);
			// A partial save leaves the catalog nonempty, which unmounts this offer, so the miss is told in a toast.
			if (sameOrg() && result.failed.length > 0)
				toastStore.error(`${result.failed.map((item) => item.name).join(', ')} could not be added. Try again.`);
		} catch (cause) {
			if (stillHere())
				failure = cause instanceof Error ? cause.message : 'Could not add the training types. Try again.';
		} finally {
			if (stillHere()) saving = false;
		}
	}
</script>

{#if lookup.state === 'failed'}
	<p role="alert" class="text-sm text-destructive-text">
		{lookup.message}
		<Button variant="link" size="none" class="align-baseline underline" onclick={() => lookUp(org.orgId)}>Retry</Button>
	</p>
{:else if lookup.state === 'loading' || open.length > 0}
	<!-- Most units are Army, so the wait holds the Army list's rows rather than shifting the page when it arrives. -->
	<SuggestionPanel
		title="Common Army annual training"
		suggestions={open}
		{unpicked}
		loading={lookup.state === 'loading'}
		loadingLabel="Checking for starter training types"
		placeholderRows={getTrainingSuggestions('army').length}
	>
		{#snippet detail(suggestion)}
			<span class="shrink-0 font-mono text-xs leading-4 text-muted-foreground">{suggestion.expirationMonths} mo</span>
		{/snippet}
		{#if failure}
			<p role="alert" class="text-sm text-destructive-text">{failure}</p>
		{/if}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<Button disabled={saving || toAdd.length === 0} aria-busy={saving} onclick={add}>
				{#if saving}<Spinner />{/if}
				Add {toAdd.length} training {toAdd.length === 1 ? 'type' : 'types'}
			</Button>
			<Button variant="link" size="none" class="underline" onclick={onNewType}>Add your own type</Button>
		</div>
	</SuggestionPanel>
{/if}
