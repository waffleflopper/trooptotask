<script lang="ts">
	import type { Component } from 'svelte';
	import type { Tasking } from '$features/calendar';
	import type { NeedsYouPanelProps } from '../../sections/needsYou';

	type PickedTasking = Pick<Tasking, 'id' | 'responsibility' | 'requirement'>;
	type AssignPeopleDialog = Component<{
		orgId: string;
		tasking: PickedTasking;
		groups: Record<string, string>;
		onSaved: () => Promise<void>;
		onClose: () => void;
	}>;

	let {
		updates,
		save,
		close,
		orgId,
		tasking,
		groups,
		Dialog
	}: NeedsYouPanelProps & {
		orgId: string;
		tasking: PickedTasking;
		groups: Record<string, string>;
		Dialog: AssignPeopleDialog;
	} = $props();

	// The row reads the saved picks before it closes the picker, so it never shows the old count behind it,
	// and it keeps focus where the row was if the row leaves the queue.
	function onSaved() {
		return save(() => updates.refreshTaskings()).catch(() => {});
	}
</script>

<Dialog {orgId} {tasking} {groups} {onSaved} onClose={close} />
