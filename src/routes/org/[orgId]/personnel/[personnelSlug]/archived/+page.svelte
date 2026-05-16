<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type {
		PersonnelArchivedArtifact,
		PersonnelArchivedArtifactsPageData,
		PersonnelArtifactKind
	} from '$features/personnel/personnel-detail.types';

	let { data }: { data: PersonnelArchivedArtifactsPageData } = $props();
	let localRecords = $state<PersonnelArchivedArtifact[] | null>(null);
	const records = $derived(localRecords ?? data.records);
	let actionKey = $state('');
	let error = $state('');

	function formatDate(value: string | null | undefined) {
		if (!value) return 'Unknown date';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
	}

	function archivedAt(record: PersonnelArchivedArtifact): string | null {
		if (record.kind === 'follow-up') return record.updatedAt;
		return record.archivedAt ?? record.createdAt;
	}

	function titleFor(record: PersonnelArchivedArtifact): string {
		if (record.kind === 'note') return record.text.slice(0, 80) || 'Leader note';
		return record.title;
	}

	function subtitleFor(record: PersonnelArchivedArtifact): string {
		if (record.kind === 'follow-up') return `Created by ${record.createdBy}`;
		if (record.kind === 'counseling') return `Uploaded by ${record.uploadedBy}`;
		if (record.kind === 'document') return `Uploaded by ${record.uploadedBy}`;
		return `Written by ${record.author}`;
	}

	function endpoint(kind: PersonnelArtifactKind, id: string): string {
		const base = `/org/${data.orgId}/api/personnel/${data.personnelId}`;
		if (kind === 'follow-up') return `${base}/follow-ups/${id}`;
		if (kind === 'counseling') return `${base}/counseling-records/${id}`;
		if (kind === 'document') return `${base}/documents/${id}`;
		return `${base}/leader-notes/${id}`;
	}

	async function restore(record: PersonnelArchivedArtifact) {
		error = '';
		actionKey = `${record.kind}:${record.id}`;
		try {
			const response = await fetch(endpoint(record.kind, record.id), {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'restore' })
			});
			if (!response.ok) throw new Error('Unable to restore archived item.');
			localRecords = records.filter((item) => item.id !== record.id || item.kind !== record.kind);
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to restore archived item.';
		} finally {
			actionKey = '';
		}
	}

	async function remove(record: PersonnelArchivedArtifact) {
		error = '';
		actionKey = `${record.kind}:${record.id}`;
		try {
			const response = await fetch(endpoint(record.kind, record.id), { method: 'DELETE' });
			if (!response.ok) throw new Error('Unable to delete archived item.');
			localRecords = records.filter((item) => item.id !== record.id || item.kind !== record.kind);
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to delete archived item.';
		} finally {
			actionKey = '';
		}
	}
</script>

<main class="p-6">
	<section class="rounded-md border bg-card">
		<div class="border-b p-4">
			<h2 class="text-lg font-semibold">{data.title}</h2>
		</div>
		<div class="space-y-5 p-6">
			{#if error}
				<p class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
			{/if}
			{#if records.length === 0}
				<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{data.emptyState}</p>
			{:else}
				<div class="divide-y rounded-md border">
					{#each records as record (record.kind + record.id)}
						<article class="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
							<div>
								<div class="flex flex-wrap items-center gap-2">
									<span class="rounded-sm border px-2 py-0.5 text-xs text-muted-foreground">{record.kind}</span>
									<h3 class="font-medium">{titleFor(record)}</h3>
								</div>
								<p class="mt-1 text-xs text-muted-foreground">
									{subtitleFor(record)} / Archived {formatDate(archivedAt(record))}
								</p>
							</div>
							<div class="flex flex-wrap items-center gap-2 md:justify-end">
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={actionKey === `${record.kind}:${record.id}`}
									onclick={() => restore(record)}
								>
									Restore
								</Button>
								<Button
									type="button"
									variant="destructive"
									size="sm"
									disabled={actionKey === `${record.kind}:${record.id}`}
									onclick={() => remove(record)}
								>
									Delete
								</Button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</main>
