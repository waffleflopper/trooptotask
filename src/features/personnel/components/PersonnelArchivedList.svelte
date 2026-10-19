<script lang="ts">
	import { untrack } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import { focusAfterDialogCloses } from '$lib/components/ui/dialog';
	import type { PersonnelArchivedArtifact } from '../contracts';
	import { ARCHIVED_KIND_LABELS, archivedDetail, archivedStamp, archivedTitle, type ArchivedFilter } from '../logModel';
	import { ArchivedList } from '../workspace/archivedList.svelte';

	interface Props {
		orgId: string;
		personnelId: string;
		initial: PersonnelArchivedArtifact[];
	}

	let { orgId, personnelId, initial }: Props = $props();

	const list = untrack(() => new ArchivedList(initial, { orgId, personnelId, fetch: (input, i) => fetch(input, i) }));
	const total = $derived(list.countOf('all'));
	const options = $derived<{ value: ArchivedFilter; label: string; count?: number }[]>([
		{ value: 'all', label: 'All', count: total },
		{ value: 'follow-up', label: 'Follow-ups' },
		{ value: 'counseling', label: 'Counselings' },
		{ value: 'document', label: 'Documents' },
		{ value: 'note', label: 'Notes' }
	]);

	let pendingDelete = $state<PersonnelArchivedArtifact | null>(null);
	let deleteError = $state('');
	let rowList = $state<HTMLElement | null>(null);

	async function confirmDelete(record: PersonnelArchivedArtifact) {
		deleteError = '';
		const index = list.visible.findIndex((item) => item.kind === record.kind && item.id === record.id);
		const failure = await list.remove(record);
		if (failure) {
			deleteError = failure;
			return;
		}
		pendingDelete = null;
		focusAfterDialogCloses(() => {
			const rows = rowList?.querySelectorAll('li') ?? [];
			return (rows[index] ?? rows[index - 1])?.querySelector('button') ?? document.getElementById('archived-heading');
		});
	}
</script>

<PageShell.SectionHeader
	eyebrow="Archived"
	title={`${total} archived ${total === 1 ? 'item' : 'items'}`}
	detail="Hidden from the record. Restore puts an item back where it was."
>
	<SegmentedFilter.Root {options} bind:value={list.filter} label="Filter archived items" />
</PageShell.SectionHeader>

<div class="mt-4 grid gap-3">
	{#if list.error}
		<Alert.Root variant="destructive"><Alert.Description>{list.error}</Alert.Description></Alert.Root>
	{/if}
	{#if list.notice}
		<Alert.Root role="status"><Alert.Description>{list.notice}</Alert.Description></Alert.Root>
	{/if}
	{#if list.visible.length === 0}
		<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
			{total === 0 ? 'Nothing is archived for this Soldier.' : 'Nothing archived in this category.'}
		</p>
	{:else}
		<ul bind:this={rowList} class="divide-y rounded-md border">
			{#each list.visible as record (record.kind + record.id)}
				<li class="flex flex-wrap items-center gap-x-4 gap-y-2 p-3.5">
					<div class="w-28 shrink-0">
						<Badge variant="outline" class="font-mono text-[11px] tracking-[0.08em] uppercase">
							{ARCHIVED_KIND_LABELS[record.kind]}
						</Badge>
					</div>
					<div class="grid min-w-0 flex-1 basis-56 gap-0.5">
						<p class="text-[15px] wrap-anywhere">{archivedTitle(record)}</p>
						<p class="text-[13px] text-muted-foreground">{archivedDetail(record)}</p>
					</div>
					<p class="w-52 text-sm text-muted-foreground">{archivedStamp(record)}</p>
					<div class="flex gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={list.isBusy(record)}
							onclick={() => list.restore(record)}
						>
							Restore
						</Button>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							disabled={list.isBusy(record)}
							onclick={() => (pendingDelete = record)}
						>
							Delete
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if pendingDelete}
	{@const target = pendingDelete}
	<ConfirmDialog
		title="Delete archived item"
		message="Permanently delete {archivedTitle(target)}? This cannot be undone."
		confirmLabel="Delete"
		variant="destructive"
		onConfirm={() => confirmDelete(target)}
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
