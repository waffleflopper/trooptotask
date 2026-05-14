<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { StatusType } from '$lib/types';
	import { cn, type WithElementRef } from '$lib/utils.js';

	export type CalendarBadgeStatusType = Pick<StatusType, 'id' | 'name' | 'color' | 'textColor'>;

	let {
		statusType,
		class: className,
		style,
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		statusType: CalendarBadgeStatusType;
		children?: import('svelte').Snippet;
	} = $props();

	const statusStyle = $derived(
		`--calendar-badge-status-bg: ${statusType.color}; --calendar-badge-status-foreground: ${statusType.textColor}; ${style ?? ''}`
	);
</script>

<Badge
	variant="outline"
	class={cn(
		'border-[color-mix(in_srgb,var(--calendar-badge-status-bg)_70%,var(--border)_30%)] bg-[var(--calendar-badge-status-bg)] text-[var(--calendar-badge-status-foreground)] [a]:hover:opacity-90 focus-visible:ring-[color-mix(in_srgb,var(--calendar-badge-status-bg)_30%,transparent)]',
		className
	)}
	style={statusStyle}
	{...restProps}
>
	{@render children?.()}
</Badge>
