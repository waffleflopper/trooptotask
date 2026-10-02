<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { Snippet } from 'svelte';
	import type { PacketStepState, PacketStepTone } from './types';

	let {
		label,
		typeLabel,
		tone = 'neutral',
		state = 'pending',
		meta,
		inactiveNote,
		status,
		children
	}: {
		label: string;
		typeLabel: string;
		tone?: PacketStepTone;
		state?: PacketStepState;
		meta?: string | null;
		inactiveNote?: string | null;
		status?: Snippet;
		children?: Snippet;
	} = $props();

	const badgeVariant = $derived.by(() => {
		if (tone === 'training') return 'info';
		if (tone === 'paperwork') return 'warning';
		if (tone === 'inactive') return 'outline';
		return 'secondary';
	});
</script>

<div
	data-slot="onboarding-packet-step"
	data-state={state}
	class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-card-foreground transition-opacity data-[state=complete]:opacity-70 data-[state=inactive]:bg-muted/45 data-[state=inactive]:opacity-60"
	role="listitem"
>
	<div class="flex min-w-0 flex-1 items-center gap-2 max-sm:w-full max-sm:flex-wrap">
		<Badge variant={badgeVariant}>{typeLabel}</Badge>
		<span class="text-sm font-medium leading-snug text-foreground">
			{label}
			{#if meta}
				<span class="font-normal text-muted-foreground">({meta})</span>
			{/if}
		</span>
		{#if inactiveNote}
			<span class="font-mono text-xs italic text-muted-foreground">{inactiveNote}</span>
		{/if}
	</div>

	{#if status}
		<div class="ml-auto flex shrink-0 items-center gap-2 max-sm:ml-0 max-sm:w-full max-sm:flex-wrap">
			{@render status()}
		</div>
	{/if}

	{#if children}
		{@render children()}
	{/if}
</div>
