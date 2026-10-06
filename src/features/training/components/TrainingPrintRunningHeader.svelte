<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		organizationName: string;
		context: string;
		colspan: number;
		/** Section title shown beside the organization; defaults to the brief's name. */
		children?: Snippet;
	}

	let { organizationName, context, colspan, children }: Props = $props();
</script>

<tr>
	<td {colspan} class="p-0 pb-2">
		<div class="flex items-baseline gap-6 border-b border-foreground pb-1.5">
			<div class="flex max-w-[65%] shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1">
				<span class="font-heading text-[15px] leading-[18px] font-bold [overflow-wrap:anywhere]"
					>{organizationName}</span
				>
				{#if children}
					{@render children()}
				{:else}
					<span class="font-mono text-[9px] leading-3 uppercase tracking-[0.06em] text-muted-foreground"
						>Training readiness brief</span
					>
				{/if}
			</div>
			<p
				class="min-w-0 flex-1 text-right font-mono text-[9px] leading-3 uppercase tracking-[0.04em] text-muted-foreground"
			>
				{context}
			</p>
		</div>
	</td>
</tr>
