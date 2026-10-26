<script lang="ts">
	import { SettingsPageHeader } from '$features/organization';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import SearchIcon from '@lucide/svelte/icons/search';
	import type { PageProps } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import { useDataTable, type ColumnDef } from '$lib/components/ui/data-table/index.js';
	import { focusAfterDialogCloses } from '$lib/components/ui/dialog';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { downloadBlob } from '$lib/utils/downloadBlob';
	import {
		buildRequestError,
		organizationLifetime,
		rejectedRequestMessage,
		withinOrganizationLifetime
	} from '$lib/stores/core';
	import { createSettingsArchivedPersonnelState } from '../settingsWorkspaceState.svelte';
	import { nextCleanupRun } from '$lib/utils/retentionCutoff';
	import { deletionCountdown } from '../archiveCountdown';
	import { ARCHIVED_PEOPLE_DEPENDENCY } from '../settingsDependencies';
	import { formatRosterDate, pluralize } from '../settingsWorkspaceFormatters';
	import type { SettingsArchivedPersonnelRow } from '../settingsSectionTypes';

	let { data }: PageProps = $props();

	const orgId = $derived($page.params.orgId ?? '');
	const archived = createSettingsArchivedPersonnelState(() => data.archivesSettings.sections.archivedPersonnel);
	let now = $state(new Date());
	$effect(() => {
		const timer = setTimeout(() => (now = new Date()), nextCleanupRun(now).getTime() - now.getTime());
		return () => clearTimeout(timer);
	});
	const removedIds = new SvelteSet<string>();
	let search = $state('');
	let restoring = $state<string | null>(null);
	let exportingPerson = $state<string | null>(null);
	let permanentlyDeletingPerson = $state<string | null>(null);
	const permanentDeleteInFlight = $derived(
		permanentlyDeletingPerson !== null && permanentlyDeletingPerson === archived.confirmPermanentDelete?.id
	);

	const months = $derived(archived.retention.months);
	const timeZone = $derived(data.archivesSettings.timeZone);
	// Retention is one length for the unit, so the oldest archive is always the next to be deleted.
	const rows = $derived(
		archived.rows
			.filter((row) => !removedIds.has(row.id))
			.toSorted((a, b) => Date.parse(a.archivedAt) - Date.parse(b.archivedAt))
	);
	const query = $derived(search.trim().toLowerCase());
	const matches = (row: SettingsArchivedPersonnelRow) =>
		!query || [row.displayName, row.mos, row.groupName].some((value) => value?.toLowerCase().includes(query));
	const shownCount = $derived(query ? rows.filter(matches).length : rows.length);
	const countdowns = $derived(new Map(rows.map((row) => [row.id, deletionCountdown(row.archivedAt, months, now)])));

	// While the table is narrower than 48rem the name cell carries the detail lanes, and the actions stack.
	const columns = (
		[
			['name', 'Name', undefined],
			['mos', 'MOS', '4rem'],
			['group', 'Group', '6.25rem'],
			['archived', 'Archived', '6rem'],
			['deletedIn', 'Deleted in', '7.5rem'],
			['actions', '', '1%']
		] as const
	).map(
		([key, header, width]): ColumnDef<SettingsArchivedPersonnelRow> => ({
			key,
			header,
			width,
			headerAriaLabel: key === 'actions' ? 'Actions' : undefined,
			rowHeader: key === 'name',
			hiddenBelow: key === 'name' || key === 'actions' ? undefined : '@3xl',
			value: () => '',
			sortable: false,
			searchable: false
		})
	);
	const table = useDataTable<SettingsArchivedPersonnelRow>({
		data: () => rows,
		columns,
		rowKey: (row) => row.id
	});

	function rowInFlight(id: string): boolean {
		return restoring === id || exportingPerson === id;
	}

	/** The row that takes focus when `id` leaves the list: the next shown row, else the previous, else the heading. */
	function focusTargetAfter(id: string): () => HTMLElement | null {
		const shown = rows.filter(matches);
		const index = shown.findIndex((row) => row.id === id);
		const neighbor = shown[index + 1] ?? shown[index - 1];
		return () =>
			(neighbor ? document.getElementById(`restore-${neighbor.id}`) : null) ??
			document.getElementById('archived-people-heading');
	}

	async function handleRestore(id: string) {
		restoring = id;
		try {
			const res = await withinOrganizationLifetime(
				fetch(`/org/${orgId}/api/personnel`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'restore', id })
				})
			);
			if (!res.ok) {
				const errData = await withinOrganizationLifetime(res.json());
				toastStore.error(errData.message ?? 'Failed to restore');
				return;
			}
			const focusTarget = focusTargetAfter(id);
			removedIds.add(id);
			toastStore.success('Personnel restored to active status');
			await tick();
			focusTarget()?.focus();
			await invalidate(ARCHIVED_PEOPLE_DEPENDENCY);
		} catch {
			toastStore.error('Failed to restore personnel');
		} finally {
			restoring = null;
		}
	}

	async function handlePermanentDelete(id: string) {
		if (permanentlyDeletingPerson === id) return;
		permanentlyDeletingPerson = id;
		try {
			const res = await withinOrganizationLifetime(
				fetch(`/org/${orgId}/api/personnel/permanent`, {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id })
				})
			);
			if (!res.ok) throw await buildRequestError(res, 'DELETE', 'personnel');
			const focusTarget = focusTargetAfter(id);
			removedIds.add(id);
			toastStore.success('Personnel permanently deleted');
			archived.clearPermanentDeleteConfirmation();
			focusAfterDialogCloses(focusTarget);
			await invalidate(ARCHIVED_PEOPLE_DEPENDENCY);
		} catch (error) {
			toastStore.error(rejectedRequestMessage(error, 'Failed to permanently delete'));
		} finally {
			permanentlyDeletingPerson = null;
		}
	}

	async function handlePersonnelExport(id: string, name: string) {
		exportingPerson = id;
		const lifetime = organizationLifetime();
		try {
			const res = await fetch(`/org/${orgId}/api/personnel/${id}/export`);
			if (!res.ok) throw new Error();
			const blob = await res.blob();
			downloadBlob(blob, `${name}-records.xlsx`);
		} catch {
			// A requested download still completes after leaving; its failure is not reported elsewhere.
			if (lifetime === organizationLifetime()) toastStore.error('Failed to export records');
		} finally {
			exportingPerson = null;
		}
	}

	const unit = $derived(data.orgName ?? 'the unit');
</script>

<svelte:document onvisibilitychange={() => document.visibilityState === 'visible' && (now = new Date())} />

<SettingsPageHeader
	page="archives"
	subtitle={`People who left ${unit}. Their records wait here for ${months} ${pluralize('month', months)}, then delete themselves. Restore anyone who comes back, exactly as they left.`}
/>

<section aria-label="Archived people">
	<PageShell.SectionHeader
		id="archived-people-heading"
		tabindex={-1}
		title="Archived people"
		detail={`${rows.length} ${pluralize('record', rows.length)} · ${months}-month retention`}
		size="compact"
		ruled
	>
		{#snippet action()}
			<div class="w-full md:w-55">
				<InputGroup.Root>
					<InputGroup.Addon>
						<SearchIcon aria-hidden="true" />
					</InputGroup.Addon>
					<InputGroup.Input
						type="search"
						bind:value={search}
						placeholder="Search archived"
						aria-label="Search archived people"
					/>
				</InputGroup.Root>
			</div>
		{/snippet}
	</PageShell.SectionHeader>
	<p class="sr-only" role="status">
		{#if query}{shownCount} of {rows.length} archived people shown{/if}
	</p>

	<DataTable.DataTable
		{table}
		variant="editorial"
		ariaLabel="Archived personnel records"
		emptyMessage={query ? `No archived people match "${search.trim()}".` : 'No one is archived.'}
		stickyHeader={false}
		cell={archiveCell}
		rowHidden={(row) => !matches(row)}
	/>

	<div class="flex items-center gap-2 py-3.5">
		<p class="flex-1 font-mono text-xs leading-5 text-muted-foreground">Retention is set in Policies.</p>
		<a
			class="text-sm font-medium text-foreground underline underline-offset-4"
			href={resolve('/org/[orgId]/settings/policies', { orgId })}
		>
			Change retention
		</a>
	</div>
</section>

{#snippet countdown(row: SettingsArchivedPersonnelRow)}
	{@const left = countdowns.get(row.id)!}
	<div class="grid w-30 gap-1">
		<span class="font-mono text-xs leading-5 {left.soon ? 'font-semibold text-warning-foreground' : ''}">
			{left.label}
		</span>
		<div class="flex h-[3px] overflow-hidden rounded-[2px] bg-border" aria-hidden="true">
			<div class={left.soon ? 'bg-warning' : 'bg-chart-5'} style:width={`${Math.round(left.elapsed * 100)}%`}></div>
		</div>
	</div>
{/snippet}

{#snippet actions(row: SettingsArchivedPersonnelRow)}
	<div
		class="flex flex-col items-end gap-1 @3xl/data-table:w-59 @3xl/data-table:flex-row @3xl/data-table:items-center @3xl/data-table:justify-end"
	>
		<Button
			id="restore-{row.id}"
			variant="outline"
			onclick={() => handleRestore(row.id)}
			disabled={!archived.commands.canRestore || rowInFlight(row.id)}
		>
			{#if restoring === row.id}<Spinner />{/if}
			Restore <span class="sr-only">{row.displayName}</span>
		</Button>
		<Button
			variant="ghost"
			onclick={() => handlePersonnelExport(row.id, row.exportFileStem)}
			disabled={!archived.commands.canExport || rowInFlight(row.id)}
		>
			{exportingPerson === row.id ? 'Exporting...' : 'Export'} <span class="sr-only">{row.displayName}</span>
		</Button>
		<Button
			variant="ghost-destructive"
			onclick={() => archived.openPermanentDeleteConfirmation(row)}
			disabled={!archived.commands.canPermanentlyDelete || rowInFlight(row.id)}
		>
			Delete <span class="sr-only">{row.displayName}</span>
		</Button>
	</div>
{/snippet}

{#snippet archiveCell(row: SettingsArchivedPersonnelRow, column: ColumnDef<SettingsArchivedPersonnelRow>)}
	{#if column.key === 'name'}
		<span class="font-semibold whitespace-normal">{row.displayName}</span>
		<div class="@3xl/data-table:hidden">
			<p class="mt-0.5 font-mono text-xs whitespace-normal text-muted-foreground">
				{[row.mos, row.groupName, `Archived ${formatRosterDate(row.archivedAt, timeZone)}`].filter(Boolean).join(' · ')}
			</p>
			<div class="mt-1.5">{@render countdown(row)}</div>
		</div>
	{:else if column.key === 'mos'}
		<span class="font-mono text-xs">{row.mos || '--'}</span>
	{:else if column.key === 'group'}
		<span class="font-mono text-xs whitespace-normal text-muted-foreground">{row.groupName || '--'}</span>
	{:else if column.key === 'archived'}
		<span class="font-mono text-xs text-muted-foreground">{formatRosterDate(row.archivedAt, timeZone)}</span>
	{:else if column.key === 'deletedIn'}
		{@render countdown(row)}
	{:else if column.key === 'actions'}
		{@render actions(row)}
	{/if}
{/snippet}

{#if archived.confirmPermanentDelete}
	{@const person = archived.confirmPermanentDelete}
	<AppDialog.Root
		open
		tone="destructive"
		busy={permanentDeleteInFlight}
		closeBlocked={archived.permanentDeleteConfirmText.trim() !== ''}
		onClose={() => archived.clearPermanentDeleteConfirmation()}
	>
		<AppDialog.Content>
			<AppDialog.Header eyebrow="Delete person · Cannot be undone">
				<AppDialog.Title>Delete {person.name}?</AppDialog.Title>
				<AppDialog.Description>
					This permanently deletes {person.name} and every record kept for them. Restore is no longer possible.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				<form
					id="permanent-delete-form"
					onsubmit={(event) => {
						event.preventDefault();
						if (archived.permanentDeleteConfirmMatches) handlePermanentDelete(person.id);
					}}
				>
					<AppDialog.TypeToConfirm
						id="confirmPermanentDeletePersonnel"
						phrase={person.name}
						matches={archived.permanentDeleteConfirmMatches}
						bind:value={archived.permanentDeleteConfirmText}
					/>
				</form>
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button
					type="button"
					variant="outline"
					disabled={permanentDeleteInFlight}
					onclick={() => archived.clearPermanentDeleteConfirmation()}>Cancel</Button
				>
				<Button
					type="submit"
					form="permanent-delete-form"
					variant={archived.permanentDeleteConfirmMatches ? 'destructive-solid' : 'outline'}
					disabled={!archived.permanentDeleteConfirmMatches}
					aria-disabled={permanentDeleteInFlight ? 'true' : undefined}
					aria-busy={permanentDeleteInFlight || undefined}
				>
					{permanentDeleteInFlight ? 'Deleting...' : 'Delete permanently'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
