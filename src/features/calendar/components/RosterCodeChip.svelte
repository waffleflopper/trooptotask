<script lang="ts">
	import type { RosterCode } from '$features/calendar/roster/rosterTypes';
	import { cn } from '$lib/utils.js';

	let { code, class: className }: { code: RosterCode; class?: string } = $props();
</script>

<span
	class={cn(
		'inline-flex size-5 shrink-0 items-center justify-center rounded-xs border border-foreground font-mono text-[11px] leading-none font-semibold',
		className
	)}
	aria-hidden="true">{code}</span
>
