<script lang="ts" module>
	export interface ReadinessHistoryEntry {
		id: string;
		/** Such as "24 Sep 2024 → 24 Sep 2026". */
		label: string;
		detail: string | null;
		href: string | null;
	}
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		entries,
		editingId = null,
		onEdit
	}: {
		/** Newest first. */
		entries: ReadinessHistoryEntry[];
		editingId?: string | null;
		/** Absent when the viewer cannot correct records. */
		onEdit?: (id: string) => void;
	} = $props();
</script>

<section aria-labelledby="readiness-history-heading">
	<h3
		id="readiness-history-heading"
		class="pb-2 font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
	>
		History
	</h3>
	{#if entries.length === 0}
		<p class="border-t py-2.5 text-[13px] leading-[18px] text-muted-foreground">Nothing recorded yet.</p>
	{:else}
		<ul>
			{#each entries as entry (entry.id)}
				<li class="flex items-center gap-3 border-t py-2.5 text-[13px] leading-[18px]">
					<span class="grow text-secondary-foreground">
						{entry.label}
						{#if entry.detail}
							<span class="block text-muted-foreground">{entry.detail}</span>
						{/if}
					</span>
					{#if entry.href}
						<a class="text-foreground underline underline-offset-4" href={entry.href} target="_blank" rel="noopener">
							Certificate
						</a>
					{/if}
					{#if onEdit}
						{#if editingId === entry.id}
							<span class="text-muted-foreground">Editing</span>
						{:else}
							<Button
								variant="link"
								size="none"
								class="text-[13px] text-foreground underline"
								aria-label={`Edit ${entry.label}`}
								onclick={() => onEdit(entry.id)}
							>
								Edit
							</Button>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
