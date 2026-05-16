<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import type {
		PersonnelCounselingRecord,
		PersonnelCounselingsPageData
	} from '$features/personnel/personnel-detail.types';

	let { data }: { data: PersonnelCounselingsPageData } = $props();
	let localRecords = $state<PersonnelCounselingRecord[] | null>(null);
	const records = $derived(localRecords ?? data.records);
	let dateConducted = $state(new Date().toISOString().slice(0, 10));
	let title = $state('');
	let summary = $state('');
	let file = $state<File | null>(null);
	let saving = $state(false);
	let actionId = $state('');
	let error = $state('');

	function updateFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		file = input.files?.[0] ?? null;
	}

	async function submitRecord() {
		error = '';
		if (!file) {
			error = 'Choose a signed counseling PDF.';
			return;
		}
		if (!title.trim()) {
			error = 'Enter a counseling title.';
			return;
		}

		const formData = new FormData();
		formData.set('dateConducted', dateConducted);
		formData.set('title', title.trim());
		formData.set('summary', summary.trim());
		formData.set('file', file);

		saving = true;
		try {
			const response = await fetch(`/org/${data.orgId}/api/personnel/${data.personnelId}/counseling-records`, {
				method: 'POST',
				body: formData
			});
			if (!response.ok) throw new Error('Unable to upload counseling PDF.');
			const record = (await response.json()) as PersonnelCounselingRecord;
			localRecords = [record, ...records];
			title = '';
			summary = '';
			file = null;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to upload counseling PDF.';
		} finally {
			saving = false;
		}
	}

	async function archiveRecord(record: PersonnelCounselingRecord) {
		error = '';
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
			localRecords = records.filter((item) => item.id !== record.id);
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to archive counseling record.';
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
			<form class="grid gap-3" onsubmit={(event) => (event.preventDefault(), submitRecord())}>
				<div class="grid gap-3 md:grid-cols-[10rem_1fr]">
					<DatePicker bind:value={dateConducted} aria-label="Counseling date conducted" placeholder="Date conducted" />
					<Input bind:value={title} aria-label="Counseling title" placeholder="Counseling title" />
				</div>
				<Textarea bind:value={summary} rows={3} aria-label="Counseling summary" placeholder="Optional summary" />
				<div class="flex flex-wrap items-center justify-between gap-3">
					<Input type="file" accept="application/pdf,.pdf" aria-label="Counseling PDF" onchange={updateFile} />
					<Button type="submit" disabled={saving}>{saving ? 'Uploading...' : 'Upload PDF'}</Button>
				</div>
				{#if error}
					<p class="text-sm text-destructive">{error}</p>
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
