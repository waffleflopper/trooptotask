<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import type { EventRead, MemberLabels } from '../../events/eventModel';
	import EventLoadFailed from '../../events/components/EventLoadFailed.svelte';
	import type { TaskingLists } from '../taskingListsModel';
	import TaskingChecklist from './TaskingChecklist.svelte';
	import TaskingEquipment from './TaskingEquipment.svelte';

	interface Props {
		orgId: string;
		taskingId: string;
		lists: Promise<EventRead<TaskingLists>>;
		members: MemberLabels;
		canEdit: boolean;
		onChanged: () => void;
	}

	let { orgId, taskingId, lists, members, canEdit, onChanged }: Props = $props();

	const streamed = new StreamedValue(() => lists);
	const loaded = $derived.by(() => {
		const current = streamed.current;
		if (current.state === 'pending' || current.state === 'absent') return null;
		if (current.state === 'failed' || current.value.status !== 'loaded') return 'failed' as const;
		return current.value.value;
	});
</script>

{#if loaded === null}
	<div class="grid gap-6" role="status" aria-label="Loading equipment and checklist">
		{#each [0, 1] as section (section)}
			<div class="grid gap-3">
				<Skeleton class="h-7 w-40" />
				<Skeleton class="h-14 w-full" />
				<Skeleton class="h-14 w-full" />
			</div>
		{/each}
	</div>
{:else if loaded === 'failed'}
	<EventLoadFailed title="Equipment and checklist could not be loaded" />
{:else}
	<TaskingEquipment {orgId} {taskingId} items={loaded.equipment} {canEdit} {onChanged} />
	<TaskingChecklist {orgId} {taskingId} items={loaded.checklist} {members} {canEdit} {onChanged} />
{/if}
