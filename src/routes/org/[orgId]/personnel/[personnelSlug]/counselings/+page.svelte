<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import type {
		PersonnelCounselingRecord,
		PersonnelCounselingsPageData
	} from '$features/personnel/personnel-detail.types';
	import { ArtifactDraft } from '$features/personnel/workspace/artifactDraft.svelte';
	import { counselingRecordDraftSpec } from '$features/personnel/workspace/personnelArtifactDraftSpecs';

	let { data }: { data: PersonnelCounselingsPageData } = $props();
	const counselingRecords = new ArtifactDraft(counselingRecordDraftSpec, {
		context: () => ({ orgId: data.orgId, personId: data.personnelId }),
		fetch: (input, init) => fetch(input, init)
	});
	let archivedIds = $state<string[]>([]);
	const records = $derived(
		counselingRecords.mergeLoaded(data.records).filter((record) => !archivedIds.includes(record.id))
	);
	let actionId = $state('');

	function updateFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		counselingRecords.selectFile(input.files?.[0] ?? null);
	}

	async function archiveRecord(record: PersonnelCounselingRecord) {
		counselingRecords.error = '';
		actionId = record.id;
		try {
			const response = await fetch(
				`/org/${data.orgId}/api/personnel/${data.personnelId}/counseling-records/${record.id}`,
				{
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ action: 'archive' })
				}
			);
			if (!response.ok) throw new Error('Unable to archive counseling record.');
			archivedIds = [...archivedIds, record.id];
		} catch (caught) {
			counselingRecords.error = caught instanceof Error ? caught.message : 'Unable to archive counseling record.';
		} finally {
			actionId = '';
		}
	}

	function formatDate(value: string) {
		const date = new Date(`${value}T00:00:00`);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
	}
</script>

<main class="p-6">
	<section class="rounded-md border bg-card">
		<div class="border-b p-4">
			<h2 class="text-lg font-semibold">{data.title}</h2>
		</div>
		<div class="space-y-5 p-6">
			<form class="grid gap-3" onsubmit={(event) => (event.preventDefault(), counselingRecords.submit())}>
				<div class="grid gap-3 md:grid-cols-[10rem_1fr]">
					<DatePicker
						bind:value={counselingRecords.fields.dateConducted}
						aria-label="Counseling date conducted"
						placeholder="Date conducted"
					/>
					<Input
						bind:value={counselingRecords.fields.title}
						aria-label="Counseling title"
						placeholder="Counseling title"
					/>
				</div>
				<Textarea
					bind:value={counselingRecords.fields.summary}
					rows={3}
					aria-label="Counseling summary"
					placeholder="Optional summary"
				/>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<Input type="file" accept="application/pdf,.pdf" aria-label="Counseling PDF" onchange={updateFile} />
					<Button type="submit" disabled={counselingRecords.saving}>
						{counselingRecords.saving ? 'Uploading...' : 'Upload PDF'}
					</Button>
				</div>
				{#if counselingRecords.error}
					<p class="text-sm text-destructive">{counselingRecords.error}</p>
				{/if}
			</form>

			{#if records.length === 0}
				<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{data.emptyState}</p>
			{:else}
				<div class="divide-y rounded-md border">
					{#each records as record (record.id)}
						<article class="grid gap-3 p-4 md:grid-cols-[11rem_1fr_auto]">
							<div>
								<p class="text-sm font-medium">{formatDate(record.dateConducted)}</p>
								<p class="text-xs text-muted-foreground">Uploaded by {record.uploadedBy}</p>
							</div>
							<div>
								<h3 class="font-medium">{record.title}</h3>
								{#if record.summary}
									<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{record.summary}</p>
								{/if}
								<p class="mt-2 text-xs text-muted-foreground">File: {record.fileName}</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={actionId === record.id}
								onclick={() => archiveRecord(record)}
							>
								Archive
							</Button>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</main>
