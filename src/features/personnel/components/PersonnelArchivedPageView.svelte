<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { PersonnelArchivedPageData } from '../contracts';
	import PersonnelArchivedList from './PersonnelArchivedList.svelte';

	interface Props {
		orgId: string;
		personnelId: string;
		data: PersonnelArchivedPageData;
	}

	let { orgId, personnelId, data }: Props = $props();
	// A derived keeps the await block from rebuilding when the layout refresh hands over a new data object.
	const archived = $derived(data.archived);
</script>

<div class="p-6">
	<h2 id="archived-heading" tabindex="-1" class="sr-only">Archived</h2>
	{#await archived}
		<div class="grid gap-4" aria-hidden="true">
			<div class="grid gap-2">
				<Skeleton class="h-3 w-20" />
				<Skeleton class="h-9 w-56" />
			</div>
			<Skeleton class="h-8 w-96 max-w-full" />
			<div class="rounded-md border">
				{#each { length: 3 } as _, index (index)}
					<div class="flex items-center gap-4 border-b p-3.5 last:border-b-0">
						<Skeleton class="h-6 w-24" />
						<div class="grid flex-1 gap-2">
							<Skeleton class="h-4 w-1/2" />
							<Skeleton class="h-3.5 w-1/3" />
						</div>
						<Skeleton class="h-8 w-40" />
					</div>
				{/each}
			</div>
		</div>
	{:then initial}
		<PersonnelArchivedList {orgId} {personnelId} {initial} />
	{:catch}
		<Alert.Root variant="destructive">
			<Alert.Description>Archived items could not be loaded. Reload the page to try again.</Alert.Description>
		</Alert.Root>
	{/await}
</div>
