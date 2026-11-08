<script lang="ts">
	import { onDestroy } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidate } from '$app/navigation';
	import type { SetupBranch } from '$features/organization/contracts';
	import { SuggestionPanel } from '$lib/components/patterns/suggestion-panel';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
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

	let branch = $state.raw<SetupBranch | null>(null);
	let alive = true;
	onDestroy(() => {
		alive = false;
	});
	$effect(() => {
		const orgId = org.orgId;
		branch = null;
		fetchTrainingSuggestionBranch(orgId).then(
			(found) => {
				if (alive && org.orgId === orgId) branch = found;
			},
			// Without a branch there is no list to offer, and the empty state still lets the viewer add types by hand.
			() => {}
		);
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
		const stillHere = () => alive && org.orgId === orgId;
		saving = true;
		failure = null;
		try {
			const result = await postTrainingSuggestions(orgId, {
				branch,
				suggestionIds: toAdd.map(({ id }) => id)
			});
			await invalidate('app:training-data');
			if (stillHere() && result.failed.length > 0) {
				failure = `${result.failed.map((item) => item.name).join(', ')} could not be added. Try again.`;
			}
		} catch (cause) {
			if (stillHere())
				failure = cause instanceof Error ? cause.message : 'Could not add the training types. Try again.';
		} finally {
			if (stillHere()) saving = false;
		}
	}
</script>

{#if open.length > 0}
	<SuggestionPanel title="Common Army annual training" suggestions={open} {unpicked}>
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
