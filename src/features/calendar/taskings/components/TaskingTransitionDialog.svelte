<script lang="ts">
	import { untrack } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Field from '$lib/components/ui/field';
	import { Textarea } from '$lib/components/ui/textarea';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { TASKING_NOTE_MAX, type Tasking, type TaskingTransition } from '../taskingModel';
	import { transitionTaskingRequest } from '../taskingRequests';

	type WrittenAction = 'block' | 'complete' | 'cancel';

	interface Props {
		orgId: string;
		tasking: Tasking;
		action: WrittenAction;
		onMoved: (tasking: Tasking) => void;
		onClose: () => void;
	}

	let { orgId, tasking, action, onMoved, onClose }: Props = $props();

	const COPY: Record<
		WrittenAction,
		{ title: string; message: string; confirm: string; keep: string; field: string; required: boolean }
	> = {
		block: {
			title: 'Block this tasking?',
			message: 'The suspense stays as it is. Say what is in the way so others can help clear it.',
			confirm: 'Block tasking',
			keep: 'Keep working',
			field: 'Reason',
			required: true
		},
		complete: {
			title: 'Complete this tasking?',
			message: 'It moves to Completed with who completed it and when. Reopen it later if more work turns up.',
			confirm: 'Complete',
			keep: 'Not yet',
			field: 'Note (optional)',
			required: false
		},
		cancel: {
			title: 'Cancel this tasking?',
			message: 'It stays on record as cancelled, with who cancelled it and when. It cannot be reopened or edited.',
			confirm: 'Cancel tasking',
			keep: 'Keep tasking',
			field: 'Reason (optional)',
			required: false
		}
	};
	// Blocking a Blocked Tasking again corrects its reason and keeps who blocked it and since when.
	const correcting = $derived(tasking.status.kind === 'blocked' && action === 'block');
	const copy = $derived(
		correcting
			? {
					...COPY.block,
					title: 'Change the block reason?',
					message: 'It stays Blocked since the same day, by the same person. Activity keeps the earlier reason.',
					confirm: 'Save reason',
					keep: 'Keep it'
				}
			: COPY[action]
	);

	let text = $state(
		untrack(() => (tasking.status.kind === 'blocked' && action === 'block' ? tasking.status.reason : ''))
	);
	let saveError = $state('');
	let open = true;

	$effect(() => () => (open = false));

	function transition(): TaskingTransition {
		const value = text.trim();
		if (action === 'block') return { action, reason: value };
		if (action === 'complete') return { action, note: value || null };
		return { action, reason: value || null };
	}

	async function confirm() {
		saveError = '';
		try {
			const request = transitionTaskingRequest(orgId, tasking.id, transition());
			onMoved(await withinOrganizationLifetime(request, () => open));
		} catch (error) {
			saveError = rejectedRequestMessage(error, 'The status did not change. Your entry is kept, so try again.');
		}
	}
</script>

<ConfirmDialog
	title={copy.title}
	message={copy.message}
	confirmLabel={copy.confirm}
	cancelLabel={copy.keep}
	variant={action === 'cancel' ? 'destructive' : 'default'}
	disabled={(copy.required && !text.trim()) || text.length > TASKING_NOTE_MAX}
	onConfirm={confirm}
	onCancel={onClose}
>
	<Field.Root>
		<Field.Label for="tasking-transition-text">{copy.field}</Field.Label>
		<Textarea id="tasking-transition-text" rows={3} bind:value={text} />
	</Field.Root>
	{#if saveError}
		<Alert.Root variant="destructive">
			<Alert.Description>{saveError}</Alert.Description>
		</Alert.Root>
	{/if}
</ConfirmDialog>
