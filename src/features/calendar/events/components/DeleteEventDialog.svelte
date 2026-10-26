<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import { STATUS_BADGES } from '../../taskings/components/taskingLabels';
	import type { Tasking } from '../../taskings/taskingModel';
	import type { CalendarEventsPageAccess } from '../../contracts';
	import type { CalendarEvent, EventDeletionMode, EventDeletionResult, EventRead } from '../eventModel';
	import { deleteEventRequest } from '../eventRequests';

	interface Props {
		org: CalendarEventsPageAccess;
		event: CalendarEvent;
		taskings: Promise<EventRead<{ taskings: Tasking[] }>>;
		onClose: () => void;
	}

	let { org, event, taskings, onClose }: Props = $props();

	const SHOWN = 4;
	const taskingCount = (count: number) => `${count} ${count === 1 ? 'tasking' : 'taskings'}`;

	let mode = $state<EventDeletionMode>('standalone');
	let saveError = $state('');
	let open = true;
	const streamed = new StreamedValue(() => taskings);
	const linked = $derived.by(() => {
		const current = streamed.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		return current.value.status === 'loaded' ? current.value.value.taskings : ('failed' as const);
	});
	// A list that failed to load may still hide linked Taskings, so the reader still chooses.
	const asks = $derived(linked === 'failed' || (Array.isArray(linked) && linked.length > 0));
	const confirmLabel = $derived.by(() => {
		if (!asks || mode === 'standalone') return 'Delete event';
		return Array.isArray(linked) ? `Delete event and ${taskingCount(linked.length)}` : 'Delete event and its taskings';
	});

	$effect(() => () => (open = false));

	function deletedMessage(result: EventDeletionResult) {
		if (result.count === 0) return `Deleted ${event.title}.`;
		if (result.taskings === 'delete') return `Deleted ${event.title} and ${taskingCount(result.count)}.`;
		return `Deleted ${event.title}. ${taskingCount(result.count)} kept as standalone.`;
	}

	async function confirm() {
		saveError = '';
		try {
			const request = deleteEventRequest(org.orgId, event.id, asks ? mode : 'standalone');
			const result = await withinOrganizationLifetime(request, () => open);
			toastStore.success(deletedMessage(result));
			void goto(`/org/${org.orgUrlSegment}/calendar/events`);
		} catch (error) {
			saveError = rejectedRequestMessage(error, 'The event was not deleted. Try again.');
		}
	}
</script>

<ConfirmDialog
	title="Delete this event?"
	message={`${event.title} and its history are deleted for good. This cannot be undone.`}
	{confirmLabel}
	cancelLabel="Keep event"
	disabled={linked === null}
	onConfirm={confirm}
	onCancel={onClose}
>
	{#if linked === null}
		<div class="grid gap-2" role="status" aria-label="Loading linked taskings">
			<Skeleton class="h-[74px] w-full rounded-lg" />
			<Skeleton class="h-[132px] w-full rounded-md" />
		</div>
	{:else if asks}
		<section class="grid min-w-0 gap-2" aria-labelledby="event-delete-taskings-heading">
			<h3 id="event-delete-taskings-heading" class="m-0 text-sm font-medium">
				{Array.isArray(linked)
					? `What happens to its ${taskingCount(linked.length)}?`
					: 'What happens to its taskings?'}
			</h3>
			{#if Array.isArray(linked)}
				<ul class="m-0 grid divide-y rounded-lg border p-0">
					{#each linked.slice(0, SHOWN) as tasking (tasking.id)}
						{@const badge = STATUS_BADGES[tasking.status.kind]}
						<li class="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
							<span class="min-w-0 truncate text-sm text-foreground">{tasking.title}</span>
							<Badge variant={badge.variant} class="shrink-0">{badge.label}</Badge>
						</li>
					{/each}
					{#if linked.length > SHOWN}
						<li class="px-3 py-2 text-sm text-muted-foreground">and {linked.length - SHOWN} more</li>
					{/if}
				</ul>
			{:else}
				<p class="m-0 text-sm text-muted-foreground">The taskings under this event could not be listed.</p>
			{/if}
			<RadioGroup.Root
				aria-labelledby="event-delete-taskings-heading"
				class="gap-2"
				bind:value={
					() => mode,
					(value) => {
						if (value === 'standalone' || value === 'delete') mode = value;
					}
				}
			>
				<RadioGroup.Card
					id="event-delete-standalone"
					value="standalone"
					title="Keep them as standalone"
					description="They stay, without an event, and their activity notes the deletion."
				/>
				<RadioGroup.Card
					id="event-delete-taskings"
					value="delete"
					title="Delete them too"
					description="Each is deleted for good with its picks, equipment, checklist and activity."
				/>
			</RadioGroup.Root>
		</section>
	{/if}
	{#if saveError}
		<Alert.Root variant="destructive">
			<Alert.Description>{saveError}</Alert.Description>
		</Alert.Root>
	{/if}
</ConfirmDialog>
