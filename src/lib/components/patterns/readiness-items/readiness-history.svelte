<script lang="ts" module>
	export type ReadinessCertificate =
		| { kind: 'stored'; href: string }
		/** A legacy link to another site, named so the reader sees where it leads. */
		| { kind: 'external'; href: string; host: string };

	export interface ReadinessHistoryEntry {
		id: string;
		/** Such as "24 Sep 2024 → 24 Sep 2026". */
		label: string;
		detail: string | null;
		certificate: ReadinessCertificate | null;
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
					{#if entry.certificate?.kind === 'stored'}
						<a
							class="text-foreground underline underline-offset-4"
							href={entry.certificate.href}
							target="_blank"
							rel="noopener"
						>
							Certificate
						</a>
					{:else if entry.certificate?.kind === 'external'}
						<a
							class="max-w-48 truncate text-foreground underline underline-offset-4"
							href={entry.certificate.href}
							title={entry.certificate.href}
							target="_blank"
							rel="external noopener noreferrer"
						>
							Certificate on {entry.certificate.host}
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
