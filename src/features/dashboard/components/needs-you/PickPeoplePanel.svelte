<script lang="ts">
	import type { Component } from 'svelte';
	import type { Tasking } from '$features/calendar';
	import type { NeedsYouPanelProps } from '../../sections/needsYou';

	type PickedTasking = Pick<Tasking, 'id' | 'responsibility' | 'requirement'>;
	type AssignPeopleDialog = Component<{
		orgId: string;
		tasking: PickedTasking;
		groups: Record<string, string>;
		onSaved: () => void;
		onClose: () => void;
	}>;

	let {
		updates,
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

	// The row reads the saved picks before the dialog closes, so it never shows the old count behind it.
	async function onSaved() {
		await updates.refreshTaskings();
		close();
	}
</script>

<Dialog {orgId} {tasking} {groups} {onSaved} onClose={close} />
