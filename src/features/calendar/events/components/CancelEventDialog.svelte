<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Field from '$lib/components/ui/field';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Textarea } from '$lib/components/ui/textarea';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import ReviewTaskingList from '../../taskings/components/ReviewTaskingList.svelte';
	import { isActiveStatus, type GroupLabels, type Tasking } from '../../taskings/taskingModel';
	import type { CalendarEventsPageAccess } from '../../contracts';
	import { EVENT_CANCELLATION_REASON_MAX, type CalendarEvent, type EventRead } from '../eventModel';
	import { cancelEventRequest } from '../eventRequests';

	interface Props {
		org: CalendarEventsPageAccess;
		event: CalendarEvent;
		taskings: Promise<EventRead<{ taskings: Tasking[]; groups: GroupLabels }>>;
		onCancelled: (event: CalendarEvent) => void;
		onClose: () => void;
	}

	let { org, event, taskings, onCancelled, onClose }: Props = $props();

	let reason = $state('');
	let saveError = $state('');
	let open = true;
	const streamed = new StreamedValue(() => taskings);
	const linked = $derived.by(() => {
		const current = streamed.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		if (current.value.status !== 'loaded') return 'failed' as const;
		const { taskings: all, groups } = current.value.value;
		return { groups, active: all.filter((tasking) => isActiveStatus(tasking.status.kind)) };
	});

	$effect(() => () => (open = false));

	async function confirm() {
		saveError = '';
		try {
			const request = cancelEventRequest(org.orgId, event.id, reason.trim() || null);
			onCancelled(await withinOrganizationLifetime(request, () => open));
		} catch (error) {
			saveError = rejectedRequestMessage(error, 'The event was not cancelled. Try again.');
		}
	}
</script>

<ConfirmDialog
	title="Cancel this event?"
	message={`${event.title} stays on record as cancelled, with who cancelled it and when. It cannot be edited after this.`}
	confirmLabel="Cancel event"
	cancelLabel="Keep event"
	disabled={reason.length > EVENT_CANCELLATION_REASON_MAX}
	onConfirm={confirm}
	onCancel={onClose}
>
	{#if linked === null}
		<div class="grid gap-2" role="status" aria-label="Loading linked taskings">
			<Skeleton class="h-14 w-full" />
		</div>
	{:else if linked === 'failed'}
		<p class="m-0 text-sm text-muted-foreground">
			The taskings under this event could not be listed. Cancelling the event does not cancel them.
		</p>
	{:else if linked.active.length > 0}
		<section class="grid gap-2" aria-labelledby="event-cancel-taskings-heading">
			<h3 id="event-cancel-taskings-heading" class="m-0 text-sm font-medium">
				These taskings stay active and linked to the cancelled event
			</h3>
			<div class="max-h-48 overflow-y-auto">
				<ReviewTaskingList {org} items={linked.active.map((tasking) => ({ tasking }))} groupLabels={linked.groups} />
			</div>
		</section>
	{/if}
	<Field.Root>
		<Field.Label for="event-cancellation-reason">Reason (optional)</Field.Label>
		<Textarea id="event-cancellation-reason" rows={3} bind:value={reason} />
	</Field.Root>
	{#if saveError}
		<Alert.Root variant="destructive">
			<Alert.Description>{saveError}</Alert.Description>
		</Alert.Root>
	{/if}
</ConfirmDialog>
