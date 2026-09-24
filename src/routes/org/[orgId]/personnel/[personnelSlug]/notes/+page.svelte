<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { PersonnelLeaderNote } from '$features/personnel/contracts';
	import type { PersonnelNotesPageData } from '$features/personnel/personnel-detail.types';
	import { ArtifactDraft } from '$features/personnel/workspace/artifactDraft.svelte';
	import { leaderNoteDraftSpec } from '$features/personnel/workspace/personnelArtifactDraftSpecs';

	let { data }: { data: PersonnelNotesPageData } = $props();
	const leaderNotes = new ArtifactDraft(leaderNoteDraftSpec, {
		context: () => ({ orgId: data.orgId, personId: data.personnelId }),
		fetch: (input, init) => fetch(input, init)
	});
	let archivedNoteIds = $state<string[]>([]);
	const notes = $derived(leaderNotes.mergeLoaded(data.notes).filter((note) => !archivedNoteIds.includes(note.id)));
	let actionId = $state('');

	async function archiveNote(note: PersonnelLeaderNote) {
		leaderNotes.error = '';
		actionId = note.id;
		try {
			const response = await fetch(`/org/${data.orgId}/api/personnel/${data.personnelId}/leader-notes/${note.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'archive' })
			});
			if (!response.ok) throw new Error('Unable to archive leader note.');
			archivedNoteIds = [...archivedNoteIds, note.id];
		} catch (caught) {
			leaderNotes.error = caught instanceof Error ? caught.message : 'Unable to archive leader note.';
		} finally {
			actionId = '';
		}
	}
</script>

<main class="p-6">
	<section class="rounded-md border bg-card">
		<div class="border-b p-4">
			<h2 class="text-lg font-semibold">{data.title}</h2>
		</div>
		<div class="space-y-5 p-6">
			<form class="space-y-3" onsubmit={(event) => (event.preventDefault(), leaderNotes.submit())}>
				<Textarea
					bind:value={leaderNotes.fields.text}
					rows={4}
					aria-label="New leader note"
					placeholder="Add an observation or accomplishment"
				/>
				<div class="flex items-center justify-between gap-3">
					{#if leaderNotes.error}
						<p class="text-sm text-destructive">{leaderNotes.error}</p>
					{:else}
						<p class="text-sm text-muted-foreground">Newest notes appear first.</p>
					{/if}
					<Button type="submit" disabled={leaderNotes.saving}>{leaderNotes.saving ? 'Saving...' : 'Add note'}</Button>
				</div>
			</form>

			{#if notes.length === 0}
				<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{data.emptyState}</p>
			{:else}
				<div class="divide-y rounded-md border">
					{#each notes as note (note.id)}
						<article class="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
							<div>
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-sm font-medium">{note.author}</p>
									<p class="text-xs text-muted-foreground">{note.date}</p>
								</div>
								<p class="mt-2 text-sm leading-relaxed">{note.text}</p>
							</div>
							<div class="flex items-start justify-end">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={actionId === note.id}
									onclick={() => archiveNote(note)}
								>
									Archive
								</Button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</main>
