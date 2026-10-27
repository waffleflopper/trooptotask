<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import type { EventRead } from '../../events/eventModel';
	import EventLoadFailed from '../../events/components/EventLoadFailed.svelte';
	import type { TaskingLists } from '../taskingListsModel';
	import TaskingChecklist from './TaskingChecklist.svelte';
	import TaskingEquipment from './TaskingEquipment.svelte';

	interface Props {
		orgId: string;
		taskingId: string;
		lists: Promise<EventRead<TaskingLists>>;
		canEdit: boolean;
		/** A Completed Tasking counts returned equipment instead of secured. */
		returning: boolean;
		canReturn: boolean;
		blocked: boolean;
		onChanged: () => void;
	}

	let { orgId, taskingId, lists, canEdit, returning, canReturn, blocked, onChanged }: Props = $props();

	const streamed = new StreamedValue(() => lists);
	const loaded = $derived.by(() => {
		const current = streamed.current;
		if (current.state === 'pending' || current.state === 'absent') return null;
		if (current.state === 'failed' || current.value.status !== 'loaded') return 'failed' as const;
		return current.value.value;
	});
</script>

<div class="@container">
	{#if loaded === null}
		<div class="grid gap-4 @min-[36rem]:grid-cols-2" role="status" aria-label="Loading equipment and checklist">
			{#each [0, 1] as card (card)}
				<div class="grid content-start gap-[10px] rounded-lg border border-border bg-card px-4 py-[14px]">
					<Skeleton class="h-6 w-36" />
					<Skeleton class="h-5 w-3/4" />
					<Skeleton class="h-5 w-2/3" />
				</div>
			{/each}
		</div>
	{:else if loaded === 'failed'}
		<EventLoadFailed title="Equipment and checklist could not be loaded" />
	{:else}
		<div class="grid gap-4 @min-[36rem]:grid-cols-2">
			<TaskingEquipment
				{orgId}
				{taskingId}
				items={loaded.equipment}
				{canEdit}
				{returning}
				{canReturn}
				{blocked}
				{onChanged}
			/>
			<TaskingChecklist {orgId} {taskingId} items={loaded.checklist} {canEdit} {onChanged} />
		</div>
	{/if}
</div>
