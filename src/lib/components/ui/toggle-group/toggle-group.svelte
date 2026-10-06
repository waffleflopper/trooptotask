<script lang="ts" module>
	import { getContext, setContext } from 'svelte';
	import type { ToggleVariants } from '$lib/components/ui/toggle/index.js';

	const TOGGLE_GROUP_CONTEXT = Symbol('toggle-group');

	export function setToggleGroupCtx(props: ToggleVariants) {
		setContext(TOGGLE_GROUP_CONTEXT, props);
	}

	export function getToggleGroupCtx() {
		return getContext<ToggleVariants>(TOGGLE_GROUP_CONTEXT);
	}
</script>

<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		size = 'default',
		variant = 'default',
		...restProps
	}: ToggleGroupPrimitive.RootProps & ToggleVariants = $props();

	setToggleGroupCtx({
		get variant() {
			return variant;
		},
		get size() {
			return size;
		}
	});
</script>

<ToggleGroupPrimitive.Root
	bind:value={value as never}
	bind:ref
	data-slot="toggle-group"
	data-variant={variant}
	data-size={size}
	class={cn('group/toggle-group flex w-fit items-center gap-0.5 rounded-lg bg-muted p-0.5', className)}
	{...restProps}
/>
