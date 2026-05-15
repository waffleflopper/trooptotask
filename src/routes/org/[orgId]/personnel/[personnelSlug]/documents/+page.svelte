<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { PersonnelDocument, PersonnelDocumentsPageData } from '$features/personnel/personnel-detail.types';

	let { data }: { data: PersonnelDocumentsPageData } = $props();
	let title = $state('');
	let file = $state<File | null>(null);
	let saving = $state(false);
	let error = $state('');
	let openingDocumentId = $state('');
	let createdRecords = $state<PersonnelDocument[]>([]);
	let records = $derived([...createdRecords, ...data.records]);

	function formatDate(value: string) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
	}

	function formatBytes(bytes: number) {
		if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${bytes} B`;
	}

	function titleFromFilename(filename: string) {
		const name = filename.split(/[\\/]/).pop() ?? '';
		const base = name.replace(/\.[^.]+$/, '');
		return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Uploaded document';
	}

	function updateFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		file = input.files?.[0] ?? null;
		if (file && !title.trim()) {
			title = titleFromFilename(file.name);
		}
	}

	async function submitRecord() {
		error = '';
		if (!file) {
			error = 'Choose a PDF, JPEG, PNG, or HEIC file.';
			return;
		}
		if (!title.trim()) {
			error = 'Enter a document title.';
			return;
		}

		const formData = new FormData();
		formData.set('title', title.trim());
		formData.set('file', file);

		saving = true;
		try {
			const response = await fetch(`/org/${data.orgId}/api/personnel/${data.personnelId}/documents`, {
				method: 'POST',
				body: formData
			});
			if (!response.ok) throw new Error('Unable to upload document.');
			const record = (await response.json()) as PersonnelDocument;
			createdRecords = [record, ...createdRecords];
			title = '';
			file = null;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to upload document.';
		} finally {
			saving = false;
		}
	}

	async function openDocument(documentId: string) {
		error = '';
		openingDocumentId = documentId;
		try {
			const response = await fetch(
				`/org/${data.orgId}/api/personnel/${data.personnelId}/documents/${documentId}/download`
			);
			if (!response.ok) throw new Error('Unable to open document.');
			const { url } = (await response.json()) as { url: string };
			window.open(url, '_blank', 'noopener,noreferrer');
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to open document.';
		} finally {
			openingDocumentId = '';
		}
	}
</script>

<main class="p-6">
	<section class="rounded-md border bg-card">
		<div class="border-b p-4">
			<h2 class="text-lg font-semibold">{data.title}</h2>
		</div>
		<div class="space-y-5 p-6">
			<form class="grid gap-3" onsubmit={(event) => (event.preventDefault(), submitRecord())}>
				<div class="grid gap-3 md:grid-cols-[1fr_auto]">
					<Input bind:value={title} aria-label="Document title" placeholder="Document title" />
					<Button type="submit" disabled={saving}>{saving ? 'Uploading...' : 'Upload'}</Button>
				</div>
				<Input
					type="file"
					accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.heic"
					aria-label="Document file"
					onchange={updateFile}
				/>
				<p class="text-xs text-muted-foreground">PDF, JPEG, PNG, or HEIC. 10MB maximum.</p>
				{#if error}
					<p class="text-sm text-destructive">{error}</p>
				{/if}
			</form>

			{#if records.length === 0}
				<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{data.emptyState}</p>
			{:else}
				<div class="divide-y rounded-md border">
					{#each records as record (record.id)}
						<article class="grid gap-3 p-4 md:grid-cols-[1fr_10rem]">
							<div>
								<h3 class="font-medium">{record.title}</h3>
								<p class="mt-2 text-xs text-muted-foreground">Uploaded by {record.uploadedBy}</p>
							</div>
							<div class="grid gap-2 text-sm text-muted-foreground md:justify-items-end md:text-right">
								<div>
									<p>{formatBytes(record.fileSizeBytes)}</p>
									<p>{formatDate(record.createdAt)}</p>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={openingDocumentId === record.id}
									onclick={() => openDocument(record.id)}
								>
									{openingDocumentId === record.id ? 'Opening...' : 'Open'}
								</Button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</main>
