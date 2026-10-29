<script lang="ts">
	import type { Tasking, TaskingChoices } from '$features/calendar';
	import * as AppDialog from '$lib/components/ui/app-dialog';

	let {
		choices,
		onSaved,
		onClose,
		busy = $bindable(false),
		dirty = $bindable(false)
	}: {
		choices: TaskingChoices;
		onSaved: (tasking: Tasking) => void;
		onClose: () => void;
		busy?: boolean;
		dirty?: boolean;
	} = $props();
</script>

<AppDialog.Header>
	<AppDialog.Title>Create tasking</AppDialog.Title>
	<AppDialog.Description>One outcome the unit must deliver.</AppDialog.Description>
</AppDialog.Header>
<AppDialog.Body>
	<label>Required outcome <input id="tasking-title" oninput={() => (dirty = true)} /></label>
	<ul>
		{#each choices.groups as group (group.id)}
			<li>{group.name}</li>
		{/each}
	</ul>
</AppDialog.Body>
<AppDialog.Footer>
	<button type="button" onclick={() => (busy = true)}>Start saving</button>
	<button type="button" onclick={onClose}>Cancel</button>
	<button type="button" onclick={() => onSaved({ id: 't-new', title: 'Brief slides' } as Tasking)}>Save</button>
</AppDialog.Footer>
