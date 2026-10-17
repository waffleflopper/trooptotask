<script lang="ts">
	import { cn } from '$lib/utils.js';

	interface Props {
		eyebrow: string;
		title: string;
		description?: string;
		tone?: 'accent' | 'destructive';
	}

	let { eyebrow, title, description, tone = 'accent' }: Props = $props();
</script>

<div class="flex flex-col gap-1">
	<p
		class={cn(
			'text-[11px] font-bold uppercase tracking-[0.08em]',
			tone === 'destructive' ? 'text-destructive' : 'text-accent-text'
		)}
	>
		{eyebrow}
	</p>
	<h2 class="font-heading text-xl leading-tight">{title}</h2>
	{#if description}
		<p class="text-xs text-muted-foreground">{description}</p>
	{/if}
</div>
