<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Field from '$lib/components/ui/field';
	import { Textarea } from '$lib/components/ui/textarea';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { EVENT_CANCELLATION_REASON_MAX, type CalendarEvent } from '../eventModel';
	import { cancelEventRequest } from '../eventRequests';

	interface Props {
		orgId: string;
		event: CalendarEvent;
		onCancelled: (event: CalendarEvent) => void;
		onClose: () => void;
	}

	let { orgId, event, onCancelled, onClose }: Props = $props();

	let reason = $state('');
	let saveError = $state('');
	let open = true;

	$effect(() => () => (open = false));

	async function confirm() {
		saveError = '';
		try {
			const request = cancelEventRequest(orgId, event.id, reason.trim() || null);
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
