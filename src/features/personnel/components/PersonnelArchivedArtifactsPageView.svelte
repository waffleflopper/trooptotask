<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import type { PersonnelArchivedArtifact } from '$features/personnel/contracts';
	import { focusAfterDialogCloses } from '$lib/components/ui/dialog';
	import type {
		PersonnelArchivedArtifactsPageData,
		PersonnelArtifactKind
	} from '$features/personnel/personnel-detail.types';

	let { data }: { data: PersonnelArchivedArtifactsPageData } = $props();
	let localRecords = $state<PersonnelArchivedArtifact[] | null>(null);
	const records = $derived(localRecords ?? data.records);
	let actionKey = $state('');
	let error = $state('');
	let pendingDelete = $state<{ record: PersonnelArchivedArtifact; url: string } | null>(null);
	let deleteError = $state('');
	let recordList = $state<HTMLElement | null>(null);

	function formatDate(value: string | null | undefined) {
		if (!value) return 'Unknown date';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
	}

	function archivedAt(record: PersonnelArchivedArtifact): string | null {
		if (record.kind === 'follow-up') return record.archivedAt ?? record.updatedAt;
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

	// The confirmation stays open until the request settles; a failure keeps it open to retry or cancel.
	async function remove({ record, url }: { record: PersonnelArchivedArtifact; url: string }) {
		deleteError = '';
		actionKey = `${record.kind}:${record.id}`;
		const index = records.findIndex((item) => item.id === record.id && item.kind === record.kind);
		try {
			const response = await fetch(url, { method: 'DELETE' });
			if (!response.ok) throw new Error('Unable to delete archived item.');
			localRecords = records.filter((item) => item.id !== record.id || item.kind !== record.kind);
			pendingDelete = null;
			focusAfterDialogCloses(() => {
				const rows = recordList?.querySelectorAll('article') ?? [];
				return (
					(rows[index] ?? rows[index - 1])?.querySelector('button') ??
					document.getElementById('archived-artifacts-heading')
				);
			});
		} catch (caught) {
			deleteError = caught instanceof Error ? caught.message : 'Unable to delete archived item.';
		} finally {
			actionKey = '';
		}
	}
</script>

<div class="p-6">
	<section class="rounded-md border bg-card">
		<div class="border-b p-4">
			<h2 id="archived-artifacts-heading" tabindex="-1" class="text-lg font-semibold">{data.title}</h2>
		</div>
		<div class="space-y-5 p-6">
			{#if error}
				<Alert.Root variant="destructive">
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if records.length === 0}
				<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{data.emptyState}</p>
			{:else}
				<div bind:this={recordList} class="divide-y rounded-md border">
					{#each records as record (record.kind + record.id)}
						<article class="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
							<div>
								<div class="flex flex-wrap items-center gap-2">
									<Badge variant="outline">{record.kind}</Badge>
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
									onclick={() => (pendingDelete = { record, url: endpoint(record.kind, record.id) })}
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
</div>

{#if pendingDelete}
	{@const target = pendingDelete}
	<ConfirmDialog
		title="Delete archived item"
		message="Permanently delete {titleFor(target.record)}? This cannot be undone."
		confirmLabel="Delete"
		variant="destructive"
		onConfirm={() => remove(target)}
		onCancel={() => {
			pendingDelete = null;
			deleteError = '';
		}}
	>
		{#if deleteError}
			<Alert.Root variant="destructive"><Alert.Description>{deleteError}</Alert.Description></Alert.Root>
		{/if}
	</ConfirmDialog>
{/if}
