<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Attachment } from 'svelte/attachments';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

	const refAttachment: Attachment<HTMLDivElement> = (node) => {
		ref = node;
		return () => {
			ref = null;
		};
	};
</script>

<div
	{@attach refAttachment}
	data-slot="field-control"
	class={cn(
		'min-w-0 [&>[data-slot=input]]:w-full [&>[data-slot=native-select-wrapper]]:w-full [&>[data-slot=select-trigger]]:w-full',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
