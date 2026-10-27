<script lang="ts">
	import { page } from '$app/state';
	import { SetupEditorNote, SetupStepFooter } from '$features/organization';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import RanksSettingsPage from '../../settings/RanksSettingsPage.svelte';
	import type { RanksSettingsData } from '../../settings/settingsSectionTypes';
	import SetupEditorLoadError from './SetupEditorLoadError.svelte';

	const streamed = $derived(page.data.ranksSettings as Promise<RanksSettingsData> | undefined);

	// A reload after a rank change keeps the editor on screen until the fresh catalog arrives.
	let shown = $state.raw<{ ranks: RanksSettingsData } | { failed: true } | null>(null);
	$effect(() => {
		const pending = streamed;
		let live = true;
		pending?.then(
			(ranks) => live && (shown = { ranks }),
			() => live && !(shown && 'ranks' in shown) && (shown = { failed: true })
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
		<RanksSettingsPage
			ranksSettings={shown.ranks}
			form={page.form}
			bind:saving
			actionBase="/org/{page.params.orgId}/settings/ranks"
		/>
	{:else if shown}
		<SetupEditorLoadError subject="The rank editor" />
	{:else}
		<div class="grid gap-10" aria-busy="true">
			<span class="sr-only">Loading the rank editor</span>
			{#each [6, 8] as rows, index (index)}
				<div class="grid" aria-hidden="true">
					<Skeleton class="mb-2 h-8 w-56" />
					{#each { length: rows }, row (row)}
						<Skeleton class="mt-2 h-9 w-full" />
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>

<SetupStepFooter blocked={saving ? 'Saving your change…' : null} />
