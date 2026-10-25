<script lang="ts" generics="T extends string">
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';

	interface Option {
		value: T;
		label: string;
		/** `null` is a count still loading: its space is held so the option keeps its width when the number arrives. */
		count?: number | null;
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

	const SEPARATOR = ' · ';
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
			{#if option.count === null}
				{option.label}<span aria-hidden="true"
					>{SEPARATOR}<span
						data-slot="segmented-filter-count-pending"
						class="inline-block h-3 w-[2ch] animate-pulse rounded-sm bg-foreground/10 align-middle"
					></span></span
				>
			{:else if option.count === undefined}
				{option.label}
			{:else}
				{option.label}{SEPARATOR}<span class="inline-block min-w-[2ch] text-start tabular-nums">{option.count}</span>
			{/if}
		</RadioGroup.Item>
	{/each}
</RadioGroup.Root>
