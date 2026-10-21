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
		/** Shows the chosen option but takes no input, such as a setting the unit turned off. */
		disabled?: boolean;
		/** The id of visible help text for the choice, such as a preset's description. */
		describedBy?: string;
	}

	let { options, value = $bindable(), label, disabled = false, describedBy }: Props = $props();
</script>

<ToggleGroup.Root
	type="single"
	size="sm"
	class="max-w-full flex-wrap"
	aria-label={label}
	aria-describedby={describedBy}
	{disabled}
	bind:value={
		() => value,
		(next) => {
			if (next) value = next as T;
		}
	}
>
	{#snippet child({ props })}
		<!-- bits-ui names a single-choice group `group`; its items are radios, so the group is a radiogroup. -->
		<div {...props} role="radiogroup">
			{#each options as option (option.value)}
				<ToggleGroup.Item value={option.value}>
					{option.count === undefined ? option.label : `${option.label} · ${option.count}`}
				</ToggleGroup.Item>
			{/each}
		</div>
	{/snippet}
</ToggleGroup.Root>
