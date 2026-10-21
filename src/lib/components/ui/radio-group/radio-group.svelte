<script lang="ts" module>
	import { getContext, setContext } from 'svelte';

	/** `segmented` draws the options as one muted track with the chosen option raised. */
	export type RadioGroupVariant = 'default' | 'segmented';

	const RADIO_GROUP_CONTEXT = Symbol('radio-group');

	export function getRadioGroupVariant(): RadioGroupVariant {
		return getContext<{ variant: RadioGroupVariant } | undefined>(RADIO_GROUP_CONTEXT)?.variant ?? 'default';
	}
</script>

<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(''),
		variant = 'default',
		...restProps
	}: RadioGroupPrimitive.RootProps & { variant?: RadioGroupVariant } = $props();

	setContext(RADIO_GROUP_CONTEXT, {
		get variant() {
			return variant;
		}
	});
</script>

<RadioGroupPrimitive.Root
	bind:ref
	bind:value
	data-slot="radio-group"
	data-variant={variant}
	class={cn(
		variant === 'segmented' ? 'flex w-fit items-center gap-0.5 rounded-lg bg-muted p-0.5' : 'grid gap-2 w-full',
		className
	)}
	{...restProps}
/>
