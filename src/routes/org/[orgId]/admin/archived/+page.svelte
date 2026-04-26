<script lang="ts">
	import { page } from '$app/stores';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { invalidateAll } from '$app/navigation';
	import FloatingPageToolbar from '$lib/components/FloatingPageToolbar.svelte';
	import { addMonths } from '$lib/utils/dates';

	let { data } = $props();
	const orgId = $derived($page.params.orgId);

	let restoring = $state<string | null>(null);
	let exporting = $state<string | null>(null);
	let confirmPermanentDelete = $state<{ id: string; name: string } | null>(null);

	type ArchivedPerson = (typeof data.archivedPersonnel)[number];

	function daysUntilAutoDelete(archivedAt: string, retentionMonths: number): number {
		const deleteDate = addMonths(new Date(archivedAt), retentionMonths);
		return Math.max(0, Math.ceil((deleteDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatCountdown(days: number): string {
		if (days <= 0) return 'Overdue';
		if (days < 30) return `${days} days`;
		const months = Math.floor(days / 30);
		return `${months} month${months !== 1 ? 's' : ''}`;
	}

	const columns: ColumnDef<ArchivedPerson>[] = [
		{
			key: 'name',
			header: 'Name',
			value: (p) => `${p.rank} ${p.lastName}, ${p.firstName}`,
			compare: (a, b) => a.lastName.localeCompare(b.lastName)
		},
		{ key: 'mos', header: 'MOS', value: (p) => p.mos || '--' },
		{ key: 'group', header: 'Group', value: (p) => p.groupName || '--' },
		{
			key: 'archived',
			header: 'Archived',
			value: (p) => p.archivedAt,
			compare: (a, b) => new Date(a.archivedAt).getTime() - new Date(b.archivedAt).getTime()
		},
		{
			key: 'autoDelete',
			header: 'Auto-Delete',
			value: (p) => daysUntilAutoDelete(p.archivedAt, data.retentionMonths),
			compare: (a, b) =>
				daysUntilAutoDelete(a.archivedAt, data.retentionMonths) -
				daysUntilAutoDelete(b.archivedAt, data.retentionMonths)
		},
		{ key: 'actions', header: 'Actions', value: () => '', searchable: false }
	];

	async function handleRestore(id: string) {
		restoring = id;
		try {
			const res = await fetch(`/org/${orgId}/api/personnel`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'restore', id })
			});
			if (!res.ok) {
				const errData = await res.json();
				toastStore.error(errData.message ?? 'Failed to restore');
				return;
			}
			toastStore.success('Personnel restored to active status');
			await invalidateAll();
		} catch {
			toastStore.error('Failed to restore personnel');
		} finally {
			restoring = null;
		}
	}

	async function handlePermanentDelete(id: string) {
		try {
			const res = await fetch(`/org/${orgId}/api/personnel/permanent`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error();
			toastStore.success('Personnel permanently deleted');
			confirmPermanentDelete = null;
			await invalidateAll();
		} catch {
			toastStore.error('Failed to permanently delete');
		}
	}

	async function handleExport(id: string, name: string) {
		exporting = id;
		try {
			const res = await fetch(`/org/${orgId}/api/personnel/${id}/export`);
			if (!res.ok) throw new Error();
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${name}-records.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			toastStore.error('Failed to export records');
		} finally {
			exporting = null;
		}
	}
</script>

<div class="archived-page">
	<main class="page-content">
		<FloatingPageToolbar ariaLabel="Archived personnel status" leadingMin="0" collapse="narrow">
			{#snippet leading()}
				<span class="toolbar-note">Retention: {data.retentionMonths} mo</span>
			{/snippet}
		</FloatingPageToolbar>

		<div class="table-shell">
			<p class="header-description">
				Archived personnel are retained for {data.retentionMonths} months before automatic permanent deletion.
			</p>

			<DataTable
				data={data.archivedPersonnel}
				{columns}
				initialSortKey="name"
				ariaLabel="Archived personnel"
				emptyMessage="No archived personnel."
			>
				{#snippet cell(row, col)}
					{#if col.key === 'name'}
						<span class="name-cell">{row.rank} {row.lastName}, {row.firstName}</span>
					{:else if col.key === 'archived'}
						{formatDate(row.archivedAt)}
					{:else if col.key === 'autoDelete'}
						{@const days = daysUntilAutoDelete(row.archivedAt, data.retentionMonths)}
						{@const countdownClass = days <= 0 ? 'overdue' : days < 30 ? 'critical' : days < 90 ? 'warning' : ''}
						<span class="countdown {countdownClass}">
							{formatCountdown(days)}
						</span>
					{:else if col.key === 'actions'}
						<div class="actions-cell">
							<button
								class="btn btn-primary btn-sm"
								onclick={() => handleRestore(row.id)}
								disabled={restoring === row.id}
							>
								{#if restoring === row.id}<Spinner />{/if}
								Restore
							</button>
							<button
								class="btn btn-secondary btn-sm"
								onclick={() => handleExport(row.id, `${row.rank}-${row.lastName}`)}
								disabled={exporting === row.id}
							>
								{#if exporting === row.id}<Spinner />{/if}
								Export
							</button>
							<button
								class="btn btn-danger btn-sm"
								onclick={() =>
									(confirmPermanentDelete = {
										id: row.id,
										name: `${row.rank} ${row.lastName}, ${row.firstName}`
									})}
							>
								Delete
							</button>
						</div>
					{:else}
						{String(col.value(row) ?? '')}
					{/if}
				{/snippet}
			</DataTable>
		</div>
	</main>
</div>

{#if confirmPermanentDelete}
	<ConfirmDialog
		title="Permanently Delete Personnel"
		message="Are you sure you want to permanently delete {confirmPermanentDelete.name}? This action cannot be undone and all associated records will be lost."
		confirmLabel="Permanently Delete"
		variant="danger"
		onConfirm={() => handlePermanentDelete(confirmPermanentDelete!.id)}
		onCancel={() => (confirmPermanentDelete = null)}
	/>
{/if}

<style>
	.archived-page {
		min-height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--surface-page);
	}

	.page-content {
		width: min(1120px, 100%);
		margin: 0 auto;
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.table-shell {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-5);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.header-description {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		line-height: 1.55;
	}

	.toolbar-note {
		display: inline-flex;
		align-items: center;
		min-height: 34px;
		padding: 0 var(--sp-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.name-cell {
		font-weight: 500;
		white-space: nowrap;
	}

	.actions-cell {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		white-space: nowrap;
		flex-wrap: wrap;
	}

	.countdown {
		font-weight: 500;
	}

	.countdown.critical {
		color: var(--danger);
	}

	.countdown.warning {
		color: var(--amber-dark);
	}

	.countdown.overdue {
		color: var(--danger);
		font-weight: 700;
	}

	@media (max-width: 640px) {
		.page-content {
			padding: var(--sp-4);
		}

		.table-shell {
			padding: var(--sp-4);
		}
	}
</style>
