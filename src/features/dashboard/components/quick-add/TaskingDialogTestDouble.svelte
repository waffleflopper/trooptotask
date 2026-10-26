<script lang="ts">
	import type { Tasking, TaskingChoices } from '$features/calendar';

	let {
		orgName,
		choices,
		onSaved,
		onClose
	}: { orgName: string; choices: TaskingChoices; onSaved: (tasking: Tasking) => void; onClose: () => void } =
		$props();
</script>

<div role="dialog" aria-label="Create tasking for {orgName}">
	<ul>
		{#each choices.groups as group (group.id)}
			<li>{group.name}</li>
		{/each}
	</ul>
	<button type="button" onclick={() => onSaved({ id: 't-new', title: 'Brief slides' } as Tasking)}>Save</button>
	<button type="button" onclick={onClose}>Cancel</button>
</div>
