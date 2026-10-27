<script lang="ts">
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Command from '$lib/components/ui/command';

	interface Props {
		id: string;
		value: string;
		/** Every current Organization Member. A value missing here belongs to someone who has left. */
		options: { userId: string; label: string }[];
		currentUserId: string;
		onChange: (userId: string) => void;
	}

	let { id, value, options, currentUserId, onChange }: Props = $props();

	const items = $derived(
		options.map((option) => ({
			value: option.userId,
			label: option.userId === currentUserId ? `${option.label} (you)` : option.label
		}))
	);
	const shown = $derived(items.find((item) => item.value === value)?.label ?? 'Former member');
</script>

<Combobox.Root
	{items}
	{value}
	label="Coordinator"
	autoHighlight
	onValueChange={(next) => {
		if (typeof next === 'string' && next) onChange(next);
	}}
>
	<Combobox.Trigger {id} placeholder="Choose a member">
		<span class="truncate">{shown}</span>
	</Combobox.Trigger>
	<Combobox.Content>
		<Combobox.Search placeholder="Search members..." />
		<Combobox.Empty>No member matches.</Combobox.Empty>
		<Command.List class="max-h-72 p-1" aria-label="Coordinator">
			<Command.Group>
				{#each items as item (item.value)}
					<Combobox.Item value={item.value} label={item.label} />
				{/each}
			</Command.Group>
		</Command.List>
	</Combobox.Content>
</Combobox.Root>
