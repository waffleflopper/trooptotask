<script lang="ts">
	import { page } from '$app/stores';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { invalidateAll } from '$app/navigation';
	import PageToolbar from '$lib/components/PageToolbar.svelte';

	let { data } = $props();
	const orgId = $derived($page.params.orgId);

	let restoring = $state<string | null>(null);
	let permanentlyDeleting = $state<string | null>(null);
	let exporting = $state<string | null>(null);
	let confirmPermanentDelete = $state<{ id: string; name: string } | null>(null);

	type ArchivedPerson = (typeof data.archivedPersonnel)[number];

	function daysUntilAutoDelete(archivedAt: string, retentionMonths: number): number {
		const archiveDate = new Date(archivedAt);
		const deleteDate = new Date(archiveDate);
		deleteDate.setMonth(deleteDate.getMonth() + retentionMonths);
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
		permanentlyDeleting = id;
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
		} finally {
			permanentlyDeleting = null;
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
	<PageToolbar title="Archived Personnel" helpTopic="settings" />

	<main class="page-content">
		<div class="overview-strip">
			<div class="overview-card">
				<span class="overview-label">Archived</span>
				<strong class="overview-value">{data.archivedPersonnel.length}</strong>
				<span class="overview-meta">Personnel records currently held in archive</span>
			</div>
			<div class="overview-card">
				<span class="overview-label">Retention</span>
				<strong class="overview-value">{data.retentionMonths} mo</strong>
				<span class="overview-meta">Automatic cleanup window before permanent deletion</span>
			</div>
		</div>

		<div class="table-shell">
			<div class="section-heading">
				<p class="section-label">Archive</p>
				<h2>Archived Personnel</h2>
			</div>
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

	.overview-strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--sp-3);
	}

	.overview-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-subtle) 8%);
	}

	.overview-label,
	.section-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.overview-label {
		color: var(--text-muted);
	}

	.section-label {
		margin: 0;
		color: var(--amber);
	}

	.overview-value {
		font-family: var(--font-display);
		font-size: clamp(1.9rem, 4vw, 2.5rem);
		line-height: 0.95;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.overview-meta {
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text-secondary);
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

	.section-heading {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.table-shell h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 2.8rem);
		line-height: 0.98;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.header-description {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		line-height: 1.55;
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
