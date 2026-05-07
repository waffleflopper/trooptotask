<script lang="ts">
	import type { Group } from '$lib/stores/groups.svelte';
	import type { Personnel } from '$lib/types';
	import { ALL_RANKS } from '$lib/types';
	import { parseCSVText, parseFile } from '$lib/utils/csvParser';
	import { PERSONNEL_COLUMNS, detectHeaderRow } from '$lib/utils/columnMapping';
	import BulkImportTable from '$lib/components/ui/BulkImportTable.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { Badge as UiBadge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import { useDataTable } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import { SvelteSet } from 'svelte/reactivity';
	import BulkPersonnelMerge from './BulkPersonnelMerge.svelte';

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
	let archiveSearch = $state('');

	// TODO: Move bulk personnel management to its own route, mirroring calendar bulk status operations.

	// --- Import state machine ---
	type ImportState = 'input' | 'preview' | 'importing' | 'results';
	let importStep = $state<ImportState>('input');

	// rawRows is derived from either the pasted text or the file upload result.
	// fileRows holds the async result from parseFile; importText drives the text path.
	let fileRows = $state<string[][]>([]);
	let uploadedFileName = $state('');
	let importText = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	let textRows = $state<string[][]>([]);
	let textError = $state('');
	let textParseRequestId = 0;

	$effect(() => {
		const currentText = uploadedFileName ? '' : importText;
		const requestId = ++textParseRequestId;

		if (!currentText.trim()) {
			textRows = [];
			textError = '';
			return;
		}

		// Clear stale rows immediately so the preview cannot use data from an older parse.
		textRows = [];
		textError = '';

		let active = true;
		parseCSVText(currentText)
			.then((rows) => {
				if (!active || requestId !== textParseRequestId) return;
				textRows = rows;
			})
			.catch((err) => {
				if (!active || requestId !== textParseRequestId) return;
				textRows = [];
				textError = err instanceof Error ? err.message : 'Failed to parse pasted text';
			});

		return () => {
			active = false;
		};
	});

	const rawRows = $derived(uploadedFileName ? fileRows : textRows);

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
		importText = '';
		try {
			fileRows = await parseFile(file);
		} catch (err) {
			fileRows = [];
			uploadedFileName = '';
			alert(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
	}

	function clearFile() {
		uploadedFileName = '';
		fileRows = [];
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

	const filteredArchivePersonnel = $derived(
		allPersonnel.filter((person) => matchesArchiveSearch(person, archiveSearch))
	);

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

	$effect(() => {
		archiveTable.setSearch(archiveSearch);
	});

	let selectedIds = new SvelteSet<string>();

	function toggleSelect(id: string) {
		if (selectedIds.has(id)) {
			selectedIds.delete(id);
		} else {
			selectedIds.add(id);
		}
	}

	function selectAll() {
		selectedIds.clear();
		for (const p of allPersonnel) selectedIds.add(p.id);
	}

	function selectNone() {
		selectedIds.clear();
	}

	function selectGroup(groupName: string) {
		const groupPersonnel = allPersonnel.filter((p) => (p.groupName || 'Unassigned') === groupName);
		for (const p of groupPersonnel) selectedIds.add(p.id);
	}

	function toggleVisible() {
		const visibleIds = filteredArchivePersonnel.map((person) => person.id);
		const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

		for (const id of visibleIds) {
			if (allVisibleSelected) {
				selectedIds.delete(id);
			} else {
				selectedIds.add(id);
			}
		}
	}

	function toggleArchiveGroup(groupName: string) {
		const groupPersonnel = allPersonnel.filter((person) => (person.groupName || 'Unassigned') === groupName);
		const allGroupSelected = groupPersonnel.length > 0 && groupPersonnel.every((person) => selectedIds.has(person.id));

		for (const person of groupPersonnel) {
			if (allGroupSelected) {
				selectedIds.delete(person.id);
			} else {
				selectedIds.add(person.id);
			}
		}
	}

	function getArchiveGroupSelectionState(groupName: string): 'all' | 'some' | 'none' {
		const groupPersonnel = allPersonnel.filter((person) => (person.groupName || 'Unassigned') === groupName);
		if (groupPersonnel.length === 0) return 'none';

		const selectedCount = groupPersonnel.filter((person) => selectedIds.has(person.id)).length;
		if (selectedCount === 0) return 'none';
		if (selectedCount === groupPersonnel.length) return 'all';
		return 'some';
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

	// Width is wider during preview to accommodate the table
	const modalWidth = $derived(
		activeTab === 'delete' ||
			activeTab === 'merge' ||
			importStep === 'preview' ||
			importStep === 'importing' ||
			importStep === 'results'
			? '800px'
			: '600px'
	);
</script>

<Modal
	title="Bulk Personnel Management"
	{onClose}
	width={modalWidth}
	titleId="bulk-personnel-title"
	canClose={importStep !== 'importing'}
	showCloseButton={importStep !== 'importing'}
>
	<div class="bulk-content">
		<div class="tabs">
			<button class="tab" type="button" class:active={activeTab === 'import'} onclick={() => (activeTab = 'import')}>
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path
						fill-rule="evenodd"
						d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
				Import
			</button>
			<button class="tab" type="button" class:active={activeTab === 'merge'} onclick={() => (activeTab = 'merge')}>
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path
						fill-rule="evenodd"
						d="M4 4a1 1 0 011-1h4a1 1 0 010 2H6v9h3a1 1 0 110 2H5a1 1 0 01-1-1V4zm7.293 2.293a1 1 0 011.414 0L16 9.586V8a1 1 0 112 0v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-3-3a1 1 0 010-1.414z"
						clip-rule="evenodd"
					/>
				</svg>
				Backfill ETS/DEROS
			</button>
			<button class="tab" type="button" class:active={activeTab === 'delete'} onclick={() => (activeTab = 'delete')}>
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
					<path
						fill-rule="evenodd"
						d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"
						clip-rule="evenodd"
					/>
				</svg>
				Archive
			</button>
		</div>

		<div class="content-body">
			{#if activeTab === 'import'}
				<!-- INPUT step -->
				{#if importStep === 'input'}
					<div class="import-section">
						<div class="upload-section">
							<h4>Upload File</h4>
							<p class="hint">Upload an Excel (.xlsx) or CSV file</p>
							<div class="upload-row">
								<input
									type="file"
									accept=".xlsx,.csv"
									onchange={handleFileUpload}
									bind:this={fileInput}
									class="file-input"
									id="fileUpload"
								/>
								<button class="btn btn-secondary upload-btn" type="button" onclick={() => fileInput?.click()}>
									<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
										<path
											fill-rule="evenodd"
											d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
											clip-rule="evenodd"
										/>
									</svg>
									Choose File
								</button>
								{#if uploadedFileName}
									<span class="file-name">{uploadedFileName}</span>
									<button class="btn btn-secondary btn-sm" type="button" onclick={clearFile}>Clear</button>
								{/if}
							</div>
							<p class="format-hint">Columns: Rank, Last Name, First Name, MOS, Duty Role, Group</p>
						</div>

						<div class="divider"><span>or paste text</span></div>

						<div class="format-info">
							<h4>Paste Data</h4>
							<p>One person per line, comma-separated:</p>
							<code>Rank, Last Name, First Name, MOS, Duty Role, Group</code>
							<p class="hint">MOS, Duty Role, and Group are optional</p>
						</div>

						<div class="example-box">
							<div class="example-header">
								<span>Example</span>
								<button
									class="btn btn-secondary btn-sm"
									type="button"
									onclick={() => {
										importText = `SGT, Smith, John, 68W, Squad Leader, Alpha Team
SPC, Johnson, Jane, 68C, Medic, Bravo Team
CPT, Williams, Robert, 11A, Platoon Leader, Headquarters
SFC, Brown, Sarah, 42A, Operations NCO, Support`;
										uploadedFileName = '';
									}}
								>
									Use Example
								</button>
							</div>
							<pre>SGT, Smith, John, 68W, Squad Leader, Alpha Team
SPC, Johnson, Jane, 68C, Medic, Bravo Team
CPT, Williams, Robert, 11A, Platoon Leader, Headquarters
SFC, Brown, Sarah, 42A, Operations NCO, Support</pre>
						</div>

						<div class="form-group">
							<label class="label" for="importText">Personnel Data</label>
							<textarea
								id="importText"
								class="input import-textarea"
								bind:value={importText}
								placeholder="Paste personnel data here..."
								rows={6}
								disabled={!!uploadedFileName}
							></textarea>
						</div>
						{#if textError}
							<p class="text-error">{textError}</p>
						{/if}
					</div>

					<!-- PREVIEW step -->
				{:else if importStep === 'preview'}
					<BulkImportTable bind:this={tableRef} {rawRows} columnDefs={PERSONNEL_COLUMNS} {validateRow} />

					<!-- IMPORTING step -->
				{:else if importStep === 'importing'}
					<div class="importing-state">
						<div class="spinner"></div>
						<p>Importing personnel records...</p>
					</div>

					<!-- RESULTS step -->
				{:else if importStep === 'results' && importResult}
					<div class="results-section">
						{#if importResult.capError}
							<div class="result-error-banner">
								<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
									<path
										fill-rule="evenodd"
										d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
										clip-rule="evenodd"
									/>
								</svg>
								{importResult.capError}
							</div>
						{/if}

						{#if importResult.insertedCount > 0}
							<div class="result-success">
								<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
									<path
										fill-rule="evenodd"
										d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
										clip-rule="evenodd"
									/>
								</svg>
								<strong>{importResult.insertedCount}</strong> personnel imported successfully
							</div>
						{/if}

						{#if importResult.errors.length > 0}
							<div class="result-errors">
								<div class="result-errors-header">
									<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
										<path
											fill-rule="evenodd"
											d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
											clip-rule="evenodd"
										/>
									</svg>
									{importResult.errors.length} record{importResult.errors.length !== 1 ? 's' : ''} had errors
								</div>
								<ul>
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
							<p class="result-empty">No records were imported.</p>
						{/if}
					</div>
				{/if}
			{:else if activeTab === 'merge'}
				<BulkPersonnelMerge {orgId} personnel={allPersonnel} {groups} onComplete={handleDone} />
			{:else}
				<div class="delete-section">
					<div class="delete-controls">
						<div class="select-buttons">
							<button class="btn btn-secondary btn-sm" type="button" onclick={selectAll}>Select All</button>
							<button class="btn btn-secondary btn-sm" type="button" onclick={selectNone}>Select None</button>
							<button class="btn btn-secondary btn-sm" type="button" onclick={toggleVisible}>
								{filteredArchivePersonnel.length > 0 &&
								filteredArchivePersonnel.every((person) => selectedIds.has(person.id))
									? 'Clear shown'
									: 'Select shown'}
							</button>
						</div>
						<input
							type="search"
							class="input archive-search"
							placeholder="Search by name, rank, MOS, role, or group..."
							bind:value={archiveSearch}
						/>
					</div>

					<div class="group-chips">
						{#each personnelByGroup as grp (grp.group)}
							{#if grp.personnel.length > 0}
								<button class="group-chip" type="button" onclick={() => selectGroup(grp.group || 'Unassigned')}>
									{grp.group || 'Unassigned'}
									<span class="chip-count">{grp.personnel.length}</span>
								</button>
							{/if}
						{/each}
					</div>

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
							<DataTable.BulkActions selectedCount={selectedIds.size} totalCount={tbl.totalRows}>
								<span class="select-hint">Use a group header or any row to select people quickly.</span>
							</DataTable.BulkActions>
						{/snippet}

						{#snippet groupHeader(group)}
							{@const selState = getArchiveGroupSelectionState(group.key)}
							<DataTable.SelectionCheckbox
								ariaLabel={`Select ${group.label} group`}
								checked={selState === 'all'}
								indeterminate={selState === 'some'}
								onCheckedChange={() => toggleArchiveGroup(group.key)}
							/>
							<Button type="button" variant="ghost" aria-expanded={!group.collapsed} onclick={group.toggle}>
								{group.collapsed ? 'Expand' : 'Collapse'}
								{group.label}
								<UiBadge variant="outline">{group.count}</UiBadge>
							</Button>
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
						<div class="delete-warning">
							<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
								<path
									fill-rule="evenodd"
									d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
									clip-rule="evenodd"
								/>
							</svg>
							<strong>{selectedIds.size}</strong> personnel selected for archival
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	{#snippet footer()}
		{#if activeTab === 'import'}
			{#if importStep === 'input'}
				<button class="btn btn-secondary" type="button" onclick={onClose}>Cancel</button>
				<button class="btn btn-primary" type="button" onclick={goToPreview} disabled={rawRows.length === 0}>
					Preview {dataRowCount > 0 ? dataRowCount : ''} Rows
				</button>
			{:else if importStep === 'preview'}
				<button class="btn btn-secondary" type="button" onclick={backToInput}>Back</button>
				<button class="btn btn-primary" type="button" onclick={runImport} disabled={runningImport}
					>Import Records</button
				>
			{:else if importStep === 'importing'}
				<button class="btn btn-secondary" disabled>Importing...</button>
			{:else if importStep === 'results'}
				<button class="btn btn-primary" type="button" onclick={handleDone}>Done</button>
			{/if}
		{:else if activeTab === 'merge'}
			<!-- Merge workflow manages its own action buttons -->
		{:else}
			<button class="btn btn-secondary" type="button" onclick={onClose}>Cancel</button>
			<button class="btn btn-warning" type="button" onclick={handleArchive} disabled={selectedIds.size === 0}>
				Archive {selectedIds.size} Personnel
			</button>
		{/if}
	{/snippet}
</Modal>

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

<style>
	.bulk-content {
		display: flex;
		flex-direction: column;
		margin: calc(-1 * var(--sp-6));
		background: var(--surface-panel);
	}

	.tabs {
		display: flex;
		padding: var(--sp-3) var(--sp-4);
		gap: var(--sp-2);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-subtle) 8%);
	}

	.tab {
		appearance: none;
		flex: 1 1 0;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 38px;
		padding: 0 var(--sp-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-secondary);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.tab:hover {
		color: var(--text-primary);
		background: var(--surface-subtle);
	}

	.tab.active {
		color: var(--amber-dark);
		border-color: var(--amber);
		background: var(--amber-light);
	}

	.content-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--sp-6);
		max-height: 65vh;
		background: var(--surface-panel);
	}

	.upload-section {
		margin-bottom: var(--sp-4);
		padding: var(--sp-5);
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface-panel) 30%);
		border-radius: var(--radius-md);
		border: 1px dashed color-mix(in srgb, var(--border-default) 88%, var(--ink-35) 12%);
	}

	.upload-section h4 {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-display);
		font-size: clamp(1.1rem, 1rem + 0.25vw, 1.3rem);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.upload-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin: var(--sp-3) 0;
	}

	.file-input {
		display: none;
	}

	.upload-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		cursor: pointer;
	}

	.file-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-primary);
		padding: 6px 10px;
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.format-hint {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin: 0;
	}

	.divider {
		display: flex;
		align-items: center;
		margin: var(--sp-5) 0;
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border-default);
	}

	.divider span {
		padding: 0 var(--sp-3);
	}

	.format-info {
		margin-bottom: var(--sp-4);
	}

	.format-info h4 {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--amber-dark);
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.format-info p {
		margin: var(--sp-2) 0;
		color: var(--text-secondary);
	}

	.format-info code {
		display: inline-block;
		padding: 6px 10px;
		background: var(--surface-subtle);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
	}

	.hint {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.example-box {
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		margin-bottom: var(--sp-4);
	}

	.example-header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--text-tertiary);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin-bottom: var(--sp-2);
	}

	.example-box pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		white-space: pre-wrap;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.import-textarea {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		resize: vertical;
	}

	.importing-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-4);
		padding: var(--sp-12) 0;
		color: var(--text-secondary);
	}

	.results-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.result-success {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-4);
		background: color-mix(in srgb, var(--success-bg) 82%, var(--surface-panel) 18%);
		border: 1px solid color-mix(in srgb, var(--success) 24%, transparent);
		border-radius: var(--radius-md);
		color: var(--success);
		font-size: var(--text-base);
	}

	.text-error {
		color: var(--danger);
		font-size: var(--text-sm);
		margin-top: var(--sp-2);
	}

	.result-error-banner {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-4);
		background: color-mix(in srgb, var(--danger-bg) 82%, var(--surface-panel) 18%);
		border: 1px solid color-mix(in srgb, var(--danger) 24%, transparent);
		border-radius: var(--radius-md);
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.result-errors {
		background: color-mix(in srgb, var(--amber-light) 76%, var(--surface-panel) 24%);
		border: 1px solid color-mix(in srgb, var(--amber) 28%, transparent);
		border-radius: var(--radius-md);
		padding: var(--sp-3) var(--sp-4);
	}

	.result-errors-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-weight: var(--font-weight-semibold);
		color: var(--amber-dark);
		margin-bottom: var(--sp-2);
	}

	.result-errors ul {
		margin: 0;
		padding-left: var(--sp-5);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.result-empty {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		text-align: center;
		padding: var(--sp-6) 0;
	}

	.delete-controls {
		display: flex;
		align-items: flex-start;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}

	.select-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.select-hint {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.archive-search {
		flex: 1 1 280px;
		max-width: 420px;
	}

	.group-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-bottom: var(--sp-4);
		padding-bottom: var(--sp-4);
		border-bottom: var(--border-thin);
	}

	.group-chip {
		appearance: none;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 30px;
		padding: 0 10px;
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.group-chip:hover {
		background: var(--surface-subtle);
		border-color: var(--ink-35);
		color: var(--text-primary);
	}

	.chip-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		min-height: 20px;
		padding: 2px 5px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
		font-size: var(--text-xs);
	}

	.delete-warning {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--danger-bg) 82%, var(--surface-panel) 18%);
		border: 1px solid color-mix(in srgb, var(--danger) 24%, transparent);
		border-radius: var(--radius-md);
		color: var(--danger);
		font-size: var(--text-sm);
	}

	@media (max-width: 640px) {
		.bulk-content {
			margin: calc(-1 * var(--sp-4));
		}

		.content-body {
			padding: var(--sp-4);
		}

		.tabs {
			padding: var(--sp-3);
		}

		.archive-search {
			max-width: none;
		}
	}
</style>
