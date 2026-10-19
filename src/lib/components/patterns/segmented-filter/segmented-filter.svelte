<script lang="ts" generics="T extends string">
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	interface Option {
		value: T;
		label: string;
		count?: number;
	}

	interface Props {
		options: readonly Option[];
		value: T;
		label: string;
	}

	let { options, value = $bindable(), label }: Props = $props();
</script>

<ToggleGroup.Root
	type="single"
	size="sm"
	class="max-w-full flex-wrap"
	aria-label={label}
	bind:value={
		() => value,
		(next) => {
			if (next) value = next as T;
		}
	}
>
	{#each options as option (option.value)}
		<ToggleGroup.Item value={option.value}>
			{option.count === undefined ? option.label : `${option.label} · ${option.count}`}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
