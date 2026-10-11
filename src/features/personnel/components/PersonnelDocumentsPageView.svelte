<script lang="ts">
	import { onDestroy } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import type { PersonnelDocument } from '$features/personnel/contracts';
	import type { PersonnelDocumentsPageData } from '$features/personnel/personnel-detail.types';
	import { ArtifactDraft } from '$features/personnel/workspace/artifactDraft.svelte';
	import { documentDraftSpec } from '$features/personnel/workspace/personnelArtifactDraftSpecs';

	let { data }: { data: PersonnelDocumentsPageData } = $props();
	let alive = true;
	onDestroy(() => {
		alive = false;
	});
	const documents = new ArtifactDraft(documentDraftSpec, {
		context: () => ({ orgId: data.orgId, personId: data.personnelId }),
		fetch: (input, init) => fetch(input, init)
	});
	let openingDocumentId = $state('');
	let actionId = $state('');
	let archivedIds = $state<string[]>([]);
	let records = $derived(documents.mergeLoaded(data.records).filter((record) => !archivedIds.includes(record.id)));
	let fileInput = $state<HTMLInputElement | null>(null);

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

	function updateFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		documents.selectFile(input.files?.[0] ?? null);
	}

	function clearFileInput() {
		if (fileInput) {
			fileInput.value = '';
			if (typeof DataTransfer !== 'undefined') fileInput.files = new DataTransfer().files;
		}
		documents.selectFile(null);
	}

	async function submitDocument() {
		if (await documents.submit()) clearFileInput();
	}

	async function openDocument(documentId: string) {
		documents.error = '';
		openingDocumentId = documentId;
		try {
			const response = await fetch(
				`/org/${data.orgId}/api/personnel/${data.personnelId}/documents/${documentId}/download`
			);
			if (!response.ok) throw new Error('Unable to open document.');
			const { url } = (await response.json()) as { url: string };
			if (alive) window.open(url, '_blank', 'noopener,noreferrer');
		} catch (caught) {
			documents.error = caught instanceof Error ? caught.message : 'Unable to open document.';
		} finally {
			openingDocumentId = '';
		}
	}

	async function archiveDocument(record: PersonnelDocument) {
		documents.error = '';
		actionId = record.id;
		try {
			const response = await fetch(`/org/${data.orgId}/api/personnel/${data.personnelId}/documents/${record.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'archive' })
			});
			if (!response.ok) throw new Error('Unable to archive document.');
			archivedIds = [...archivedIds, record.id];
		} catch (caught) {
			documents.error = caught instanceof Error ? caught.message : 'Unable to archive document.';
		} finally {
			actionId = '';
		}
	}
</script>

<div class="p-6">
	<section class="rounded-md border bg-card">
		<div class="border-b p-4">
			<h2 class="text-lg font-semibold">{data.title}</h2>
		</div>
		<div class="space-y-5 p-6">
			<form class="grid gap-3" onsubmit={(event) => (event.preventDefault(), submitDocument())}>
				<div class="grid gap-3 md:grid-cols-[1fr_auto]">
					<Field.Root data-invalid={documents.fieldError('title') ? true : undefined}>
						<Input bind:value={documents.fields.title} aria-label="Document title" placeholder="Document title" />
						{#if documents.fieldError('title')}
							<Field.Error>{documents.fieldError('title')}</Field.Error>
						{/if}
					</Field.Root>
					<Button type="submit" disabled={documents.saving}>{documents.saving ? 'Uploading...' : 'Upload'}</Button>
				</div>
				<Field.Root data-invalid={documents.fieldError('file') ? true : undefined}>
					<Input
						bind:ref={fileInput}
						type="file"
						accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.heic"
						aria-label="Document file"
						onchange={updateFile}
					/>
					{#if documents.fieldError('file')}
						<Field.Error>{documents.fieldError('file')}</Field.Error>
					{/if}
				</Field.Root>
				<p class="text-xs text-muted-foreground">PDF, JPEG, PNG, or HEIC. 10MB maximum.</p>
				{#if documents.error}
					<Alert.Root variant="destructive">
						<Alert.Description>{documents.error}</Alert.Description>
					</Alert.Root>
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
								<div class="flex gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={openingDocumentId === record.id}
										onclick={() => openDocument(record.id)}
									>
										{openingDocumentId === record.id ? 'Opening...' : 'Open'}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={actionId === record.id}
										onclick={() => archiveDocument(record)}
									>
										Archive
									</Button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</div>
