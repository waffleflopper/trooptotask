<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { PersonnelLogPageData } from '../contracts';
	import type { Personnel } from '../personnel.types';
	import PersonnelFollowUpsColumn from './PersonnelFollowUpsColumn.svelte';
	import PersonnelNotesColumn from './PersonnelNotesColumn.svelte';

	interface Props {
		orgId: string;
		person: Personnel;
		today: string;
		data: PersonnelLogPageData;
		addIntent: string | null;
	}

	let { orgId, person, today, data, addIntent }: Props = $props();

	let editingKey = $state<string | null>(null);
	// An await block rebuilds when its expression is re-evaluated, even for the same promise. The layout counts
	// refresh hands this page a new data object, so the blocks read a derived that changes only with the promise.
	const followUps = $derived(data.followUps);
	const notes = $derived(data.notes);
</script>

{#snippet columnSkeleton(rows: number)}
	<div class="grid gap-3.5" aria-hidden="true">
		<div class="grid gap-2">
			<Skeleton class="h-3 w-24" />
			<Skeleton class="h-9 w-40" />
		</div>
		<Skeleton class="h-11 w-full" />
		<div class="grid gap-0">
			{#each { length: rows } as _, index (index)}
				<div class="flex items-start gap-3 border-b border-border py-3">
					<Skeleton class="mt-1 size-4.5 shrink-0" />
					<div class="grid flex-1 gap-2">
						<Skeleton class="h-4 w-3/5" />
						<Skeleton class="h-3.5 w-4/5" />
					</div>
					<Skeleton class="h-3.5 w-20" />
				</div>
			{/each}
		</div>
	</div>
{/snippet}

{#snippet failed(what: string)}
	<Alert.Root variant="destructive">
		<Alert.Description>{what} could not be loaded. Reload the page to try again.</Alert.Description>
	</Alert.Root>
{/snippet}

<div class="p-6">
	<h2 class="sr-only">Log</h2>
	<div class="grid items-start gap-x-12 gap-y-10 lg:grid-cols-2">
		<section aria-label="Follow-ups" class="min-w-0">
			{#await followUps}
				{@render columnSkeleton(3)}
			{:then initial}
				<PersonnelFollowUpsColumn
					{orgId}
					personnelId={person.id}
					{today}
					{initial}
					focusAdd={addIntent === 'follow-up'}
					{editingKey}
					onEditingKey={(key) => (editingKey = key)}
				/>
			{:catch}
				{@render failed('Follow-ups')}
			{/await}
		</section>
		<section aria-label="Leader notes" class="min-w-0">
			{#await notes}
				{@render columnSkeleton(3)}
			{:then initial}
				<PersonnelNotesColumn
					{orgId}
					personnelId={person.id}
					subject={`${person.rank} ${person.lastName}`.toUpperCase()}
					{initial}
					focusAdd={addIntent === 'note'}
					{editingKey}
					onEditingKey={(key) => (editingKey = key)}
				/>
			{:catch}
				{@render failed('Leader notes')}
			{/await}
		</section>
	</div>
</div>
