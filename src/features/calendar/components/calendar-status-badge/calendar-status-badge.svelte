<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { StatusType } from '$features/calendar/contracts';
	import type { WithElementRef } from '$lib/utils.js';

	let {
		statusType,
		style,
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		statusType: Pick<StatusType, 'id' | 'name' | 'color' | 'textColor'>;
		children?: import('svelte').Snippet;
	} = $props();
</script>

<Badge style="background-color: {statusType.color}; color: {statusType.textColor}; {style ?? ''}" {...restProps}>
	{@render children?.()}
</Badge>
