<script lang="ts" generics="T extends string">
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';

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

<RadioGroup.Root
	variant="segmented"
	orientation="horizontal"
	class="max-w-full flex-wrap"
	aria-label={label}
	aria-describedby={describedBy}
	{disabled}
	bind:value={() => value, (next) => (value = next as T)}
>
	{#each options as option (option.value)}
		<RadioGroup.Item value={option.value}>
			{option.count === undefined ? option.label : `${option.label} · ${option.count}`}
		</RadioGroup.Item>
	{/each}
</RadioGroup.Root>
