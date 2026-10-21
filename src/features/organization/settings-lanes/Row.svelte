<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { Label } from '$lib/components/ui/label';
	import { cn } from '$lib/utils.js';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		label: string;
		labelFor?: string;
		description?: string;
		muted?: boolean;
		control?: Snippet;
		details?: Snippet;
	};

	let {
		label,
		labelFor,
		description,
		muted = false,
		control,
		details,
		class: className,
		...restProps
	}: Props = $props();
</script>

<div
	data-slot="fact-row"
	data-variant="display"
	class={cn(
		'grid gap-x-6 gap-y-3.5 border-b border-border py-6 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-start',
		className
	)}
	{...restProps}
>
	<dt class="grid content-start gap-1">
		<span
			class={cn(
				'flex items-center gap-1.5 font-heading text-[22px] leading-6 font-bold',
				muted ? 'text-muted-foreground' : 'text-foreground'
			)}
		>
			{#if labelFor}
				<Label for={labelFor} class="text-[length:inherit] leading-[inherit] font-[inherit]">{label}</Label>
			{:else}
				{label}
			{/if}
		</span>
		{#if description}
			<span class="text-sm text-muted-foreground">{description}</span>
		{/if}
	</dt>
	{#if control}
		<dd class="flex md:min-w-16 md:justify-end">{@render control()}</dd>
	{/if}
	{#if details}
		<dd class="min-w-0 md:col-span-full">{@render details()}</dd>
	{/if}
</div>
