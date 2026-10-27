<script lang="ts">
	import { page } from '$app/state';
	import { SetupEditorNote, SetupStepFooter } from '$features/organization';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import RanksSettingsPage from '../../settings/RanksSettingsPage.svelte';
	import type { RanksSettingsData } from '../../settings/settingsSectionTypes';
	import SetupEditorLoadError from './SetupEditorLoadError.svelte';

	const streamed = $derived(page.data.ranksSettings as Promise<RanksSettingsData> | undefined);

	// A reload after a rank change keeps the editor on screen until the fresh catalog arrives.
	let shown = $state.raw<{ ranks: RanksSettingsData; stale?: true } | { failed: true } | null>(null);
	$effect(() => {
		const pending = streamed;
		let live = true;
		pending?.then(
			(ranks) => live && (shown = { ranks }),
			() => live && (shown = shown && 'ranks' in shown ? { ranks: shown.ranks, stale: true } : { failed: true })
		);
		return () => (live = false);
	});

	let saving = $state(false);
</script>

<div class="flex flex-col gap-10">
	<SetupEditorNote>
		This is the same editor as Settings › Ranks. Anything you change here is there later, and nothing is locked in.
	</SetupEditorNote>
	{#if shown && 'ranks' in shown}
		{#if shown.stale}
			<SetupEditorLoadError subject="The rank editor" stale />
		{/if}
		<RanksSettingsPage
			ranksSettings={shown.ranks}
			form={page.form}
			bind:saving
			actionBase="/org/{page.params.orgId}/settings/ranks"
		/>
	{:else if shown}
		<SetupEditorLoadError subject="The rank editor" />
	{:else}
		<div class="grid gap-6" aria-busy="true">
			<span class="sr-only">Loading the rank editor</span>
			<Skeleton class="h-8 w-56" aria-hidden="true" />
			{#each [10, 5, 13] as chips, index (index)}
				<div class="grid gap-3" aria-hidden="true">
					<Skeleton class="h-5 w-32" />
					<div class="flex flex-wrap gap-2">
						{#each { length: chips }, chip (chip)}
							<Skeleton class="h-8 w-20" />
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<SetupStepFooter blocked={saving ? 'Saving your change…' : null} />
