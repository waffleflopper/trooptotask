<script module lang="ts">
	import type { AvailabilityUndoChange } from '$features/calendar/availabilityUndo';
	import type { ToastAction } from '$lib/stores/toast.svelte';
	import { removedEntry } from './BulkStatusRemoveUndoStub.svelte';

	/** Runs the page's save, then builds the Undo its toast would offer. */
	export const saves: (() => Promise<ToastAction>)[] = [];
</script>

<script lang="ts">
	let {
		onApply,
		undoAction
	}: {
		onApply: (...args: [string[], string, string, string, string | null]) => Promise<unknown>;
		undoAction: (change: AvailabilityUndoChange) => ToastAction;
	} = $props();
	saves.push(async () => {
		await onApply(
			[removedEntry.personnelId],
			removedEntry.statusTypeId,
			removedEntry.startDate,
			removedEntry.endDate,
			null
		);
		return undoAction({ remove: [removedEntry] });
	});
</script>
