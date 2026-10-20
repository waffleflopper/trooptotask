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

<!-- Each column's header, its add form and one row, at their loaded heights. -->
{#snippet columnSkeleton(form: string)}
	<div aria-hidden="true">
		<div class="grid gap-0.5">
			<Skeleton class="h-4 w-24" />
			<Skeleton class="h-[46px] w-40" />
		</div>
		<Skeleton class={['mt-3.5 w-full', form]} />
		<div class="mt-2 flex items-start gap-3 border-b border-border py-3">
			<Skeleton class="mt-1 size-4.5 shrink-0" />
			<div class="grid flex-1 gap-0.5">
				<Skeleton class="h-7 w-3/5" />
				<Skeleton class="h-4 w-4/5" />
			</div>
			<Skeleton class="mt-0.5 h-4 w-20" />
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
				{@render columnSkeleton('h-11')}
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
				{@render columnSkeleton('h-32')}
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
