<script lang="ts">
	import type { Group } from '../stores/groups.svelte';
	import type { Personnel } from '../types';
	import { ALL_RANKS } from '../types';
	import { parseCSVText, parseFile } from '../utils/csvParser';
	import { PERSONNEL_COLUMNS } from '../utils/columnMapping';
	import BulkImportTable from './ui/BulkImportTable.svelte';
	import ConfirmDialog from './ui/ConfirmDialog.svelte';
	import Modal from './Modal.svelte';
	import { SvelteSet } from 'svelte/reactivity';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		groups: Group[];
		orgId: string;
		onImportComplete: () => void;
		onBulkDelete: (ids: string[]) => void;
		onClose: () => void;
	}

	let { personnelByGroup, groups, orgId, onImportComplete, onBulkDelete, onClose }: Props = $props();

	type TabType = 'import' | 'delete';
	let activeTab = $state<TabType>('import');

	// --- Import state machine ---
	type ImportState = 'input' | 'preview' | 'importing' | 'results';
	let importStep = $state<ImportState>('input');

	// rawRows is derived from either the pasted text or the file upload result.
	// fileRows holds the async result from parseFile; importText drives the text path.
	let fileRows = $state<string[][]>([]);
	let uploadedFileName = $state('');
	let importText = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	const rawRows = $derived(
		uploadedFileName ? fileRows : (importText.trim() ? parseCSVText(importText) : [])
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

	// --- Validate row for BulkImportTable ---
	function validateRow(row: Record<string, string>) {
		const cellErrors: Record<string, string> = {};
		const cellWarnings: Record<string, string> = {};

		// rank: required + must be valid
		const rank = (row.rank ?? '').trim();
		if (!rank) {
			cellErrors.rank = 'Rank is required';
		} else if (!ALL_RANKS.includes(rank as (typeof ALL_RANKS)[number])) {
			cellErrors.rank = `"${rank}" is not a valid rank`;
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
				cellWarnings.groupName = `"${groupName}" doesn't match any group — will be unassigned`;
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
		if (!tableRef) return;
		const checkedRows = tableRef.getCheckedRows();
		if (checkedRows.length === 0) return;

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
		} catch (err) {
			importResult = {
				insertedCount: 0,
				errors: [{ index: -1, message: err instanceof Error ? err.message : 'Network error' }]
			};
		}

		importStep = 'results';
	}

	function handleDone() {
		onImportComplete();
		onClose();
	}

	// --- Archive tab state (unchanged) ---
	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));

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
		const groupPersonnel = allPersonnel.filter((p) => p.groupName === groupName);
		for (const p of groupPersonnel) selectedIds.add(p.id);
	}

	let showArchiveConfirm = $state(false);

	function handleArchive() {
		if (selectedIds.size > 0) {
			showArchiveConfirm = true;
		}
	}

	function doArchive() {
		onBulkDelete([...selectedIds]);
		selectedIds.clear();
		showArchiveConfirm = false;
	}

	// Width is wider during preview to accommodate the table
	const modalWidth = $derived(importStep === 'preview' || importStep === 'importing' || importStep === 'results' ? '800px' : '600px');
</script>

<Modal
	title="Bulk Personnel Management"
	{onClose}
	width={modalWidth}
	titleId="bulk-personnel-title"
	showCloseButton={false}
>
	<div class="bulk-content">
		<div class="tabs">
			<button
				class="tab"
				class:active={activeTab === 'import'}
				onclick={() => (activeTab = 'import')}
			>
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
				</svg>
				Import
			</button>
			<button
				class="tab"
				class:active={activeTab === 'delete'}
				onclick={() => (activeTab = 'delete')}
			>
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
					<path fill-rule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd" />
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
							<p class="hint">Upload an Excel (.xlsx, .xls) or CSV file</p>
							<div class="upload-row">
								<input
									type="file"
									accept=".xlsx,.xls,.csv"
									onchange={handleFileUpload}
									bind:this={fileInput}
									class="file-input"
									id="fileUpload"
								/>
								<label for="fileUpload" class="btn btn-secondary upload-btn">
									<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
										<path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
									</svg>
									Choose File
								</label>
								{#if uploadedFileName}
									<span class="file-name">{uploadedFileName}</span>
									<button class="btn btn-secondary btn-sm" onclick={clearFile}>Clear</button>
								{/if}
							</div>
							<p class="format-hint">Columns: Rank, Last Name, First Name, MOS, Role, Group</p>
						</div>

						<div class="divider"><span>or paste text</span></div>

						<div class="format-info">
							<h4>Paste Data</h4>
							<p>One person per line, comma-separated:</p>
							<code>Rank, Last Name, First Name, MOS, Role, Group</code>
							<p class="hint">MOS, Role, and Group are optional</p>
						</div>

						<div class="example-box">
							<div class="example-header">
								<span>Example</span>
								<button
									class="btn btn-secondary btn-sm"
									onclick={() => {
										importText = `SGT, Smith, John, 68W, Medic, Alpha Team
SPC, Johnson, Jane, 68C, Admin, Bravo Team
CPT, Williams, Robert, 62A, Physician, Leadership
CIV, Brown, Sarah, RN, Receptionist, Support`;
										uploadedFileName = '';
									}}
								>
									Use Example
								</button>
							</div>
							<pre>SGT, Smith, John, 68W, Medic, Alpha Team
SPC, Johnson, Jane, 68C, Admin, Bravo Team
CPT, Williams, Robert, 62A, Physician, Leadership
CIV, Brown, Sarah, RN, Receptionist, Support</pre>
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
					</div>

				<!-- PREVIEW step -->
				{:else if importStep === 'preview'}
					<BulkImportTable
						bind:this={tableRef}
						{rawRows}
						columnDefs={PERSONNEL_COLUMNS}
						{validateRow}
					/>

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
									<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
								</svg>
								{importResult.capError}
							</div>
						{/if}

						{#if importResult.insertedCount > 0}
							<div class="result-success">
								<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
									<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
								</svg>
								<strong>{importResult.insertedCount}</strong> personnel imported successfully
							</div>
						{/if}

						{#if importResult.errors.length > 0}
							<div class="result-errors">
								<div class="result-errors-header">
									<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
										<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
									</svg>
									{importResult.errors.length} record{importResult.errors.length !== 1 ? 's' : ''} had errors
								</div>
								<ul>
									{#each importResult.errors as err (err.index)}
										<li>
											{#if err.index >= 0}Row {err.index + 1}: {/if}{err.message}
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

			<!-- ARCHIVE tab (unchanged) -->
			{:else}
				<div class="delete-section">
					<div class="delete-controls">
						<div class="select-buttons">
							<button class="btn btn-secondary btn-sm" onclick={selectAll}>Select All</button>
							<button class="btn btn-secondary btn-sm" onclick={selectNone}>Select None</button>
						</div>
						<span class="select-hint">Click a group to add all members</span>
					</div>

					<div class="group-chips">
						{#each personnelByGroup as grp (grp.group)}
							{#if grp.personnel.length > 0}
								<button
									class="group-chip"
									onclick={() => selectGroup(grp.group)}
								>
									{grp.group}
									<span class="chip-count">{grp.personnel.length}</span>
								</button>
							{/if}
						{/each}
					</div>

					<div class="personnel-checklist">
						{#each personnelByGroup as grp (grp.group)}
							{#if grp.personnel.length > 0}
								<div class="checklist-group">
									<div class="checklist-header">{grp.group}</div>
									<div class="checklist-items">
										{#each grp.personnel as person (person.id)}
											{@const isSelected = selectedIds.has(person.id)}
											<label class="checklist-item" class:selected={isSelected}>
												<input
													type="checkbox"
													checked={isSelected}
													onchange={() => toggleSelect(person.id)}
												/>
												<span class="item-rank">{person.rank}</span>
												<span class="item-name">{person.lastName}, {person.firstName}</span>
												{#if person.clinicRole}
													<span class="item-role">{person.clinicRole}</span>
												{/if}
											</label>
										{/each}
									</div>
								</div>
							{/if}
						{/each}
					</div>

					{#if selectedIds.size > 0}
						<div class="delete-warning">
							<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
								<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
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
				<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
				<button
					class="btn btn-primary"
					onclick={goToPreview}
					disabled={rawRows.length === 0}
				>
					Preview {rawRows.length > 0 ? rawRows.length : ''} Rows
				</button>
			{:else if importStep === 'preview'}
				<button class="btn btn-secondary" onclick={backToInput}>Back</button>
				<button class="btn btn-primary" onclick={runImport}>
					Import Records
				</button>
			{:else if importStep === 'importing'}
				<button class="btn btn-secondary" disabled>Importing...</button>
			{:else if importStep === 'results'}
				<button class="btn btn-primary" onclick={handleDone}>Done</button>
			{/if}
		{:else}
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			<button
				class="btn btn-warning"
				onclick={handleArchive}
				disabled={selectedIds.size === 0}
			>
				Archive {selectedIds.size} Personnel
			</button>
		{/if}
	{/snippet}
</Modal>

{#if showArchiveConfirm}
	<ConfirmDialog
		title="Archive Personnel"
		message="Archive {selectedIds.size} personnel? They will be hidden from all active views."
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
		margin: calc(-1 * var(--spacing-lg));
	}

	.tabs {
		display: flex;
		border-bottom: 1px solid var(--color-border);
	}

	.tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		font-weight: 500;
		color: var(--color-text-muted);
		border-bottom: 2px solid transparent;
		transition: all 0.15s ease;
	}

	.tab:hover {
		color: var(--color-text);
		background: var(--color-bg);
	}

	.tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.content-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-lg);
		max-height: 65vh;
	}

	/* Import Section */
	.upload-section {
		margin-bottom: var(--spacing-md);
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		border: 2px dashed var(--color-border);
	}

	.upload-section h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.upload-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin: var(--spacing-sm) 0;
	}

	.file-input {
		display: none;
	}

	.upload-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		cursor: pointer;
	}

	.file-name {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-surface);
		border-radius: var(--radius-sm);
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.format-hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin: 0;
	}

	.divider {
		display: flex;
		align-items: center;
		margin: var(--spacing-lg) 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--color-border);
	}

	.divider span {
		padding: 0 var(--spacing-md);
	}

	.format-info {
		margin-bottom: var(--spacing-md);
	}

	.format-info h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--spacing-xs);
	}

	.format-info p {
		margin: var(--spacing-xs) 0;
	}

	.format-info code {
		display: inline-block;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		font-family: monospace;
		font-size: var(--font-size-sm);
	}

	.hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.example-box {
		background: var(--color-bg);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.example-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-xs);
	}

	.example-box pre {
		margin: 0;
		font-family: monospace;
		font-size: var(--font-size-sm);
		white-space: pre-wrap;
		color: var(--color-text);
	}

	.import-textarea {
		font-family: monospace;
		font-size: var(--font-size-sm);
		resize: vertical;
	}

	/* Importing state */
	.importing-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
		padding: var(--spacing-xl) 0;
		color: var(--color-text-muted);
	}

	/* Results section */
	.results-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.result-success {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: var(--radius-md);
		color: #15803d;
		font-size: var(--font-size-base);
	}

	.result-error-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: var(--radius-md);
		color: #dc2626;
		font-size: var(--font-size-sm);
	}

	.result-errors {
		background: #fff3cd;
		border: 1px solid #fde68a;
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
	}

	.result-errors-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-weight: 600;
		color: #92400e;
		margin-bottom: var(--spacing-xs);
	}

	.result-errors ul {
		margin: 0;
		padding-left: var(--spacing-lg);
		font-size: var(--font-size-sm);
		color: #78350f;
	}

	.result-empty {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		text-align: center;
		padding: var(--spacing-lg) 0;
	}

	/* Delete Section */
	.delete-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-md);
	}

	.select-buttons {
		display: flex;
		gap: var(--spacing-sm);
	}

	.select-hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.group-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-md);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.group-chip {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		transition: all 0.15s ease;
	}

	.group-chip:hover {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: #0F0F0F;
	}

	.chip-count {
		background: rgba(0, 0, 0, 0.1);
		padding: 1px 6px;
		border-radius: 10px;
		font-size: 11px;
	}

	.group-chip:hover .chip-count {
		background: rgba(255, 255, 255, 0.2);
	}

	.personnel-checklist {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		max-height: 350px;
		overflow-y: auto;
	}

	.checklist-group {
		background: var(--color-bg);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.checklist-header {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-weight: 600;
		font-size: var(--font-size-sm);
		color: var(--color-primary);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.checklist-items {
		padding: var(--spacing-xs);
	}

	.checklist-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		cursor: pointer;
		font-size: var(--font-size-sm);
		border-radius: var(--radius-sm);
		transition: background-color 0.1s ease;
	}

	.checklist-item:hover {
		background: var(--color-surface);
	}

	.checklist-item.selected {
		background: #fef2f2;
	}

	.checklist-item input[type='checkbox'] {
		cursor: pointer;
		accent-color: #dc2626;
	}

	.item-rank {
		font-weight: 600;
		color: var(--color-primary);
		min-width: 35px;
	}

	.item-name {
		flex: 1;
	}

	.item-role {
		color: var(--color-text-muted);
	}

	.delete-warning {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: var(--radius-md);
		color: #dc2626;
		font-size: var(--font-size-sm);
	}
</style>
