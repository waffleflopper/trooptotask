<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { PersonnelLeaderNote, PersonnelNotesPageData } from '$features/personnel/personnel-detail.types';

	let { data }: { data: PersonnelNotesPageData } = $props();
	let noteText = $state('');
	let notes = $derived(data.notes);
	let saving = $state(false);
	let error = $state('');

	async function submitNote() {
		error = '';
		const text = noteText.trim();
		if (!text) {
			error = 'Enter a leader note before saving.';
			return;
		}

		saving = true;
		try {
			const response = await fetch(`/org/${data.orgId}/api/personnel/${data.personnelId}/leader-notes`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text })
			});
			if (!response.ok) throw new Error('Unable to save leader note.');
			const note = (await response.json()) as PersonnelLeaderNote;
			notes = [note, ...notes];
			noteText = '';
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to save leader note.';
		} finally {
			saving = false;
		}
	}
</script>

<main class="p-6">
	<section class="rounded-md border bg-card">
		<div class="border-b p-4">
			<h2 class="text-lg font-semibold">{data.title}</h2>
		</div>
		<div class="space-y-5 p-6">
			<form class="space-y-3" onsubmit={(event) => (event.preventDefault(), submitNote())}>
				<Textarea
					bind:value={noteText}
					rows={4}
					aria-label="New leader note"
					placeholder="Add an observation or accomplishment"
				/>
				<div class="flex items-center justify-between gap-3">
					{#if error}
						<p class="text-sm text-destructive">{error}</p>
					{:else}
						<p class="text-sm text-muted-foreground">Newest notes appear first.</p>
					{/if}
					<Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add note'}</Button>
				</div>
			</form>

			{#if notes.length === 0}
				<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{data.emptyState}</p>
			{:else}
				<div class="divide-y rounded-md border">
					{#each notes as note (note.id)}
						<article class="p-4">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="text-sm font-medium">{note.author}</p>
								<p class="text-xs text-muted-foreground">{note.date}</p>
							</div>
							<p class="mt-2 text-sm leading-relaxed">{note.text}</p>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</main>
