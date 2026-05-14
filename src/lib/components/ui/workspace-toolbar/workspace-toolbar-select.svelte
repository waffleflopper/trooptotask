<script lang="ts" generics="TValue extends string">
	import * as Select from '$lib/components/ui/select';
	import type { WorkspaceToolbarOption } from './types.js';

	type Props<T extends string> = {
		ariaLabel: string;
		options: WorkspaceToolbarOption<T>[];
		value: T;
		disabled?: boolean;
		onValueChange: (value: T) => void;
	};

	let { ariaLabel, options, value, disabled = false, onValueChange }: Props<TValue> = $props();

	const selectedLabel = $derived(options.find((option) => option.value === value)?.label ?? ariaLabel);
</script>

<Select.Root type="single" value={value as never} onValueChange={(next) => onValueChange(next as TValue)}>
	<Select.Trigger size="sm" aria-label={ariaLabel} {disabled}>{selectedLabel}</Select.Trigger>
	<Select.Content>
		{#each options as option (option.value)}
			<Select.Item value={option.value} label={option.label} />
		{/each}
	</Select.Content>
</Select.Root>
