<script module lang="ts">
	import type { AvailabilityEntry } from '$features/calendar/contracts';
	import type { AvailabilityUndoChange } from '$features/calendar/availabilityUndo';
	import type { ToastAction } from '$lib/stores/toast.svelte';

	export const offered: ToastAction[] = [];
	/** The page's Undo factory, for a save that finishes after the page is gone. */
	export const factories: ((change: AvailabilityUndoChange) => ToastAction)[] = [];
	export const removedEntry: AvailabilityEntry = {
		id: 'entry-1',
		personnelId: 'person-1',
		statusTypeId: 'leave',
		startDate: '2030-10-19',
		endDate: '2030-10-23',
		note: null
	};
</script>

<script lang="ts">
	let { undoAction }: { undoAction: (change: AvailabilityUndoChange) => ToastAction } = $props();
	factories.push((change) => undoAction(change));
	const offer = () => offered.push(undoAction({ restore: [removedEntry] }));
	offer();
</script>
