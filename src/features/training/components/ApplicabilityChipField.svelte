<script lang="ts">
	import * as Combobox from '$lib/components/ui/combobox';
	import type { ApplicabilityChip } from '../utils/trainingTypeDraft';

	let {
		id,
		label,
		options,
		chips = $bindable(),
		placeholder = 'Add a role, MOS or rank…'
	}: {
		id: string;
		label: string;
		/** Every role, MOS and rank that can be added. Chips already chosen stay selectable even when missing here. */
		options: ApplicabilityChip[];
		chips: ApplicabilityChip[];
		placeholder?: string;
	} = $props();

	const KIND_GROUP = { role: 'Roles', mos: 'MOS', rank: 'Ranks' } as const;
	const KIND_LABEL = { role: 'Role', mos: 'MOS', rank: 'Rank' } as const;

	const keyOf = (chip: ApplicabilityChip) => `${chip.kind}:${chip.value}`;
	const chipOf = (key: string): ApplicabilityChip => {
		const split = key.indexOf(':');
		return { kind: key.slice(0, split) as ApplicabilityChip['kind'], value: key.slice(split + 1) };
	};

	const items = $derived(
		[...new Map([...options, ...chips].map((chip) => [keyOf(chip), chip])).values()].map((chip) => ({
			value: keyOf(chip),
			label: chip.value,
			group: KIND_GROUP[chip.kind]
		}))
	);
</script>

<Combobox.Root
	{items}
	multiple
	autoHighlight
	{label}
	value={chips.map(keyOf)}
	onValueChange={(next) => (chips = (next as string[]).map(chipOf))}
>
	<Combobox.Chips data-testid="{id}-chips">
		<Combobox.Value>
			{#snippet children(keys)}
				{#each keys as key (key)}
					{@const chip = chipOf(key)}
					<Combobox.Chip value={key}>
						<span class="font-mono text-[10px] tracking-[0.06em] uppercase">{KIND_LABEL[chip.kind]}</span>
						<span class="font-heading text-foreground">{chip.value}</span>
					</Combobox.Chip>
				{/each}
				<Combobox.ChipsInput {id} {placeholder} aria-label={label} />
			{/snippet}
		</Combobox.Value>
	</Combobox.Chips>
	<Combobox.Content>
		<Combobox.Empty>No role, MOS or rank matches.</Combobox.Empty>
		<Combobox.List aria-label={label} />
	</Combobox.Content>
</Combobox.Root>
