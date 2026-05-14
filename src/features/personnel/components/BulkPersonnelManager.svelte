<script lang="ts">
	import type { Group } from '$lib/stores/groups.svelte';
	import type { Personnel } from '$lib/types';
	import { ALL_RANKS } from '$lib/types';
	import { parseFile } from '$lib/utils/csvParser';
	import { PERSONNEL_COLUMNS, detectHeaderRow } from '$lib/utils/columnMapping';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import BulkImportTable from '$lib/components/ui/BulkImportTable.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tabs from '$lib/components/ui/tabs';
	import { useDataTable } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import { SvelteSet } from 'svelte/reactivity';
	import BulkPersonnelMerge from './BulkPersonnelMerge.svelte';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import ImportIcon from '@lucide/svelte/icons/download';
	import MergeIcon from '@lucide/svelte/icons/git-merge';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		groups: Group[];
		orgId: string;
		onImportComplete: () => void;
		onBulkDelete: (ids: string[]) => void | Promise<void>;
		onClose: () => void;
	}

	let { personnelByGroup, groups, orgId, onImportComplete, onBulkDelete, onClose }: Props = $props();

	type TabType = 'import' | 'merge' | 'delete';
	let activeTab = $state<TabType>('import');

	// TODO: Move bulk personnel management to its own route, mirroring calendar bulk status operations.

	// --- Import state machine ---
	type ImportState = 'input' | 'preview' | 'importing' | 'results';
	let importStep = $state<ImportState>('input');

	let fileRows = $state<string[][]>([]);
	let uploadedFileName = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);
	let importError = $state('');

	const rawRows = $derived(fileRows);

	const dataRowCount = $derived(
		rawRows.length > 0 && detectHeaderRow(rawRows[0], PERSONNEL_COLUMNS) ? rawRows.length - 1 : rawRows.length
	);

	// Results state
	interface ImportResult {
		insertedCount: number;
		errors: Array<{ index: number; message: string }>;
		capError?: string;
	}
	let importResult = $state<ImportResult | null>(null);

	// BulkImportTable ref — used to call getCheckedRows()
	let tableRef = $state<ReturnType<typeof BulkImportTable>>();

	// Double-submit guard for the import action
	let runningImport = $state(false);
	let mergeRef = $state<ReturnType<typeof BulkPersonnelMerge>>();
	let mergeFooterState = $state({
		step: 'input' as 'input' | 'preview' | 'merging' | 'results',
		disabled: true,
		label: 'Preview Rows'
	});

	// --- Validate row for BulkImportTable ---
	function validateRow(row: Record<string, string>) {
		const cellErrors: Record<string, string> = {};
		const cellWarnings: Record<string, string> = {};

		// rank: required + must be valid
		const rank = (row.rank ?? '').trim();
		if (!rank) {
			cellErrors.rank = 'Rank is required';
		} else if (!ALL_RANKS.some((r) => r.toLowerCase() === rank.toLowerCase())) {
			cellErrors.rank = `"${rank}" is not a valid rank. Valid ranks: ${ALL_RANKS.join(', ')}`;
		}

		// lastName: required
		const lastName = (row.lastName ?? '').trim();
		if (!lastName) {
			cellErrors.lastName = 'Last name is required';
		}

		// firstName: required
		const firstName = (row.firstName ?? '').trim();
		if (!firstName) {
			cellErrors.firstName = 'First name is required';
		}

		// groupName: optional but warn if not found
		const groupName = (row.groupName ?? '').trim();
		if (groupName) {
			const match = groups.find((g) => g.name.toLowerCase() === groupName.toLowerCase());
			if (!match) {
				cellWarnings.groupName = `"${groupName}" doesn't match any group — will be unassigned. Available groups: ${groups.map((g) => g.name).join(', ')}`;
			}
		}

		return {
			valid: Object.keys(cellErrors).length === 0,
			cellErrors,
			cellWarnings
		};
	}

	// --- Input step handlers ---
	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploadedFileName = file.name;
		importError = '';
		try {
			fileRows = await parseFile(file);
		} catch (err) {
			fileRows = [];
			uploadedFileName = '';
			importError = err instanceof Error ? err.message : 'Failed to parse uploaded file';
		}
	}

	function clearFile() {
		uploadedFileName = '';
		fileRows = [];
		importError = '';
		if (fileInput) fileInput.value = '';
	}

	function goToPreview() {
		importStep = 'preview';
	}

	function backToInput() {
		importStep = 'input';
	}

	// --- Import ---
	async function runImport() {
		if (runningImport) return;
		runningImport = true;
		if (!tableRef) {
			runningImport = false;
			return;
		}
		const checkedRows = tableRef.getCheckedRows();
		if (checkedRows.length === 0) {
			runningImport = false;
			return;
		}

		importStep = 'importing';

		try {
			const response = await fetch(`/org/${orgId}/api/personnel/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ records: checkedRows })
			});

			const data = await response.json();

			if (response.status === 403 && data.error) {
				importResult = { insertedCount: 0, errors: data.errors ?? [], capError: data.error };
			} else {
				importResult = {
					insertedCount: (data.inserted ?? []).length,
					errors: data.errors ?? []
				};
			}
			importStep = 'results';
		} catch (err) {
			importResult = {
				insertedCount: 0,
				errors: [{ index: -1, message: err instanceof Error ? err.message : 'Network error' }]
			};
			importStep = 'results';
		} finally {
			runningImport = false;
		}
	}

	function handleDone() {
		onImportComplete();
		onClose();
	}

	// --- Archive tab state ---
	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));
	const archiveGroupOrder = $derived(
		new Map(personnelByGroup.map((group, index) => [group.group || 'Unassigned', index]))
	);

	function matchesArchiveSearch(person: Personnel, query: string) {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return true;

		return (
			person.lastName.toLowerCase().includes(normalized) ||
			person.firstName.toLowerCase().includes(normalized) ||
			person.rank.toLowerCase().includes(normalized) ||
			person.clinicRole.toLowerCase().includes(normalized) ||
			person.groupName.toLowerCase().includes(normalized) ||
			person.mos.toLowerCase().includes(normalized)
		);
	}

	const archiveColumns: ColumnDef<Personnel>[] = [
		{ key: 'select', header: '', value: () => '', searchable: false },
		{ key: 'rank', header: 'Rank', value: (person) => person.rank },
		{
			key: 'name',
			header: 'Name',
			value: (person) => `${person.lastName}, ${person.firstName}`,
			compare: (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
		},
		{ key: 'role', header: 'Duty Role', value: (person) => person.clinicRole || 'No duty role assigned' }
	];

	const archiveTable = useDataTable<Personnel>({
		data: () => allPersonnel,
		columns: archiveColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		filterFn: matchesArchiveSearch,
		groupBy: {
			key: (person) => person.groupName || 'Unassigned',
			compare: (a, b) =>
				(archiveGroupOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (archiveGroupOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
		}
	});

	let selectedIds = new SvelteSet<string>();

	function toggleSelect(id: string) {
		if (selectedIds.has(id)) {
			selectedIds.delete(id);
		} else {
			selectedIds.add(id);
		}
	}

	let showArchiveConfirm = $state(false);

	function handleArchive() {
		if (selectedIds.size > 0) {
			showArchiveConfirm = true;
		}
	}

	async function doArchive() {
		await onBulkDelete([...selectedIds]);
		selectedIds.clear();
		showArchiveConfirm = false;
	}

	const dialogSize = $derived(
		activeTab === 'delete' ||
			activeTab === 'merge' ||
			importStep === 'preview' ||
			importStep === 'importing' ||
			importStep === 'results'
			? 'wide'
			: 'default'
	);
</script>

<AppDialog.Root open closeBlocked={importStep === 'importing'} {onClose}>
	<AppDialog.Content size={dialogSize} closeBlocked={importStep === 'importing'}>
		<AppDialog.Header>
			<AppDialog.Title>Bulk Personnel Management</AppDialog.Title>
		</AppDialog.Header>

		<AppDialog.Body>
			<Tabs.Root bind:value={activeTab}>
				<Tabs.List>
					<Tabs.Trigger value="import"><ImportIcon />Import</Tabs.Trigger>
					<Tabs.Trigger value="merge"><MergeIcon />Backfill ETS/DEROS</Tabs.Trigger>
					<Tabs.Trigger value="delete"><ArchiveIcon />Archive</Tabs.Trigger>
				</Tabs.List>

				<div class="min-h-0">
					<Tabs.Content value="import">
						{#if activeTab === 'import'}
							{#if importStep === 'input'}
								<div class="grid gap-5">
									<section class="grid gap-3 rounded-lg border border-dashed border-border bg-muted/25 p-4">
										<div class="grid gap-1">
											<h4 class="font-medium">Upload File</h4>
											<p class="text-sm text-muted-foreground">Upload an Excel (.xlsx) or CSV file.</p>
										</div>
										<Input
											id="fileUpload"
											type="file"
											accept=".xlsx,.csv"
											onchange={handleFileUpload}
											bind:ref={fileInput}
										/>
										{#if uploadedFileName}
											<div class="flex items-center justify-between gap-2">
												<span class="truncate font-mono text-xs">{uploadedFileName}</span>
												<Button variant="outline" size="sm" type="button" onclick={clearFile}>Clear</Button>
											</div>
										{/if}
										<p class="text-xs text-muted-foreground">
											Columns: Rank, Last Name, First Name, MOS, Duty Role, Group
										</p>
									</section>

									{#if importError}
										<p class="text-sm text-destructive">{importError}</p>
									{/if}
								</div>
							{:else if importStep === 'preview'}
								<BulkImportTable bind:this={tableRef} {rawRows} columnDefs={PERSONNEL_COLUMNS} {validateRow} />
							{:else if importStep === 'importing'}
								<div class="grid justify-items-center gap-4 py-12 text-muted-foreground">
									<Spinner />
									<p>Importing personnel records...</p>
								</div>
							{:else if importStep === 'results' && importResult}
								<div class="grid gap-4">
									{#if importResult.capError}
										<div class="rounded-lg border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
											{importResult.capError}
										</div>
									{/if}

									{#if importResult.insertedCount > 0}
										<div class="rounded-lg border border-primary/20 bg-primary/10 p-4">
											<strong>{importResult.insertedCount}</strong> personnel imported successfully
										</div>
									{/if}

									{#if importResult.errors.length > 0}
										<div class="rounded-lg border border-border bg-muted/40 p-4">
											<div class="mb-2 font-medium">
												{importResult.errors.length} record{importResult.errors.length !== 1 ? 's' : ''} had errors
											</div>
											<ul class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
												{#each importResult.errors as err (err.index)}
													<li>
														{#if err.index >= 0}Row {err.index + 1}:
														{/if}{err.message}
													</li>
												{/each}
											</ul>
										</div>
									{/if}

									{#if importResult.insertedCount === 0 && importResult.errors.length === 0 && !importResult.capError}
										<p class="py-6 text-center text-sm text-muted-foreground">No records were imported.</p>
									{/if}
								</div>
							{/if}
						{/if}
					</Tabs.Content>

					<Tabs.Content value="merge">
						{#if activeTab === 'merge'}
							<BulkPersonnelMerge
								bind:this={mergeRef}
								{orgId}
								personnel={allPersonnel}
								{groups}
								onComplete={handleDone}
								showInputActions={false}
								bind:footerState={mergeFooterState}
							/>
						{/if}
					</Tabs.Content>

					<Tabs.Content value="delete">
						{#if activeTab === 'delete'}
							<div class="grid gap-4">
								<DataTable.DataTable
									table={archiveTable}
									columns={archiveColumns}
									ariaLabel="Personnel archive selection"
									emptyMessage="No personnel match your search."
									compact
									maxHeight="360px"
									onRowClick={(person) => toggleSelect(person.id)}
								>
									{#snippet toolbar(tbl)}
										<div class="flex flex-wrap items-center justify-between gap-2">
											<DataTable.Search
												table={tbl}
												ariaLabel="Search personnel archive table"
												placeholder="Search by name, rank, MOS, role, or group..."
											/>
											<DataTable.BulkActions selectedCount={selectedIds.size} totalCount={tbl.totalRows} />
										</div>
									{/snippet}

									{#snippet groupHeader(group)}
										<span class="font-medium">{group.label}</span>
									{/snippet}

									{#snippet cell(row, col)}
										{#if col.key === 'select'}
											<DataTable.SelectionCheckbox
												checked={selectedIds.has(row.id)}
												ariaLabel={`Select ${row.rank} ${row.lastName}, ${row.firstName}`}
												onCheckedChange={() => toggleSelect(row.id)}
											/>
										{:else}
											{String(col.value(row) ?? '')}
										{/if}
									{/snippet}
								</DataTable.DataTable>

								{#if selectedIds.size > 0}
									<div
										class="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-center text-sm text-destructive"
									>
										<strong>{selectedIds.size}</strong> personnel selected for archival
									</div>
								{/if}
							</div>
						{/if}
					</Tabs.Content>
				</div>
			</Tabs.Root>
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if activeTab === 'import'}
				{#if importStep === 'input'}
					<Button variant="outline" type="button" onclick={onClose}>Cancel</Button>
					<Button type="button" onclick={goToPreview} disabled={rawRows.length === 0}>
						Preview {dataRowCount > 0 ? dataRowCount : ''} Rows
					</Button>
				{:else if importStep === 'preview'}
					<Button variant="outline" type="button" onclick={backToInput}>Back</Button>
					<Button type="button" onclick={runImport} disabled={runningImport}>Import Records</Button>
				{:else if importStep === 'importing'}
					<Button variant="outline" disabled>Importing...</Button>
				{:else if importStep === 'results'}
					<Button type="button" onclick={handleDone}>Done</Button>
				{/if}
			{:else if activeTab === 'delete'}
				<Button variant="outline" type="button" onclick={onClose}>Cancel</Button>
				<Button variant="destructive" type="button" onclick={handleArchive} disabled={selectedIds.size === 0}>
					Archive {selectedIds.size} Personnel
				</Button>
			{:else if activeTab === 'merge' && mergeFooterState.step === 'input'}
				<Button variant="outline" type="button" onclick={onClose}>Cancel</Button>
				<Button type="button" onclick={() => mergeRef?.previewRows()} disabled={mergeFooterState.disabled}>
					{mergeFooterState.label}
				</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if showArchiveConfirm}
	<ConfirmDialog
		title="Archive Personnel"
		message="Archive {selectedIds.size} personnel? They will leave active rosters, calendars, and reports. Records are not erased, and some archives may require approval."
		confirmLabel="Archive"
		variant="warning"
		onConfirm={doArchive}
		onCancel={() => (showArchiveConfirm = false)}
	/>
{/if}
