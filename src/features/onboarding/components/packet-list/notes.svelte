<script lang="ts">
	import { PACKET_EYEBROW } from './layout';
	import type { PacketNoteEntry } from './types';

	let { notes }: { notes: PacketNoteEntry[] } = $props();

	const uid = $props.id();
	const headingId = `packet-notes-${uid}`;
</script>

<section data-slot="onboarding-packet-notes" class="grid content-start gap-3 md:w-80 md:shrink-0">
	<h4 id={headingId} class={PACKET_EYEBROW}>Notes · {notes.length}</h4>
	{#if notes.length === 0}
		<p class="text-sm text-muted-foreground">No notes on this packet.</p>
	{:else}
		<ul aria-labelledby={headingId} class="grid gap-3">
			{#each notes as note, index (index)}
				<li class="grid gap-1 border-l-2 border-border pl-3">
					<p class="text-sm italic text-foreground">“{note.text}”</p>
					<p class="text-xs text-muted-foreground">{note.byline}</p>
				</li>
			{/each}
		</ul>
	{/if}
</section>
