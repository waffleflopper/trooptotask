<script lang="ts">
	import type { Personnel } from '../types';
	import type { Group } from '../stores/groups.svelte';
	import { ALL_RANKS } from '../types';
	import * as XLSX from 'xlsx';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		groups: Group[];
		onBulkAdd: (personnel: Omit<Personnel, 'id'>[]) => void;
		onBulkDelete: (ids: string[]) => void;
		onClose: () => void;
	}

	let { personnelByGroup, groups, onBulkAdd, onBulkDelete, onClose }: Props = $props();

	type TabType = 'import' | 'delete';
	let activeTab = $state<TabType>('import');

	// Import state
	let importText = $state('');
	let importErrors = $state<string[]>([]);
	let parsedPersonnel = $state<Omit<Personnel, 'id'>[]>([]);
	let fileInput: HTMLInputElement;
	let uploadedFileName = $state('');

	// Delete state
	let selectedIds = $state<Set<string>>(new Set());

	const allPersonnel = $derived(
		personnelByGroup.flatMap((g) => g.personnel)
	);

	const groupNames = $derived(groups.map(g => g.name));

	const exampleFormat = `SGT, Smith, John, 68W, Medic, Alpha Team
SPC, Johnson, Jane, 68C, Admin, Bravo Team
CPT, Williams, Robert, 62A, Physician, Leadership
CIV, Brown, Sarah, RN, Receptionist, Support`;

	function parseImportText() {
		importErrors = [];
		parsedPersonnel = [];

		if (!importText.trim()) {
			return;
		}

		const lines = importText.trim().split('\n');
		const parsed: Omit<Personnel, 'id'>[] = [];
		const errors: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;

			const parts = line.split(',').map((p) => p.trim());

			if (parts.length < 3) {
				errors.push(`Line ${i + 1}: Need at least Rank, Last Name, First Name`);
				continue;
			}

			const [rank, lastName, firstName, mos = '', clinicRole = '', groupName = ''] = parts;

			// Validate rank
			if (!ALL_RANKS.includes(rank as any)) {
				errors.push(`Line ${i + 1}: Invalid rank "${rank}"`);
				continue;
			}

			// Validate group if provided
			const matchedGroup = groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
			if (groupName && !matchedGroup) {
				errors.push(`Line ${i + 1}: Unknown group "${groupName}" - will be unassigned`);
			}

			parsed.push({
				rank,
				lastName,
				firstName,
				mos,
				clinicRole,
				groupId: matchedGroup?.id ?? null,
				groupName: matchedGroup?.name ?? ''
			});
		}

		importErrors = errors;
		parsedPersonnel = parsed;
	}

	function handleImport() {
		if (parsedPersonnel.length > 0) {
			onBulkAdd(parsedPersonnel);
			importText = '';
			parsedPersonnel = [];
			importErrors = [];
			uploadedFileName = '';
		}
	}

	function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploadedFileName = file.name;
		const reader = new FileReader();

		reader.onload = (e) => {
			try {
				const data = e.target?.result;
				const workbook = XLSX.read(data, { type: 'array' });
				const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
				const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });

				// Skip header row if it looks like a header
				let startRow = 0;
				if (rows.length > 0) {
					const firstCell = String(rows[0][0] || '').toLowerCase();
					if (firstCell === 'rank' || firstCell === 'grade' || firstCell.includes('rank')) {
						startRow = 1;
					}
				}

				// Parse rows into personnel
				const parsed: Omit<Personnel, 'id'>[] = [];
				const errors: string[] = [];

				for (let i = startRow; i < rows.length; i++) {
					const row = rows[i];
					if (!row || row.length === 0 || !row[0]) continue;

					const rank = String(row[0] || '').trim();
					const lastName = String(row[1] || '').trim();
					const firstName = String(row[2] || '').trim();
					const mos = String(row[3] || '').trim();
					const clinicRole = String(row[4] || '').trim();
					const groupName = String(row[5] || '').trim();

					if (!rank || !lastName || !firstName) {
						errors.push(`Row ${i + 1}: Need at least Rank, Last Name, First Name`);
						continue;
					}

					if (!ALL_RANKS.includes(rank as any)) {
						errors.push(`Row ${i + 1}: Invalid rank "${rank}"`);
						continue;
					}

					const matchedGroup = groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
					if (groupName && !matchedGroup) {
						errors.push(`Row ${i + 1}: Unknown group "${groupName}" - will be unassigned`);
					}

					parsed.push({
						rank,
						lastName,
						firstName,
						mos,
						clinicRole,
						groupId: matchedGroup?.id ?? null,
						groupName: matchedGroup?.name ?? ''
					});
				}

				importErrors = errors;
				parsedPersonnel = parsed;
				importText = ''; // Clear text area since we're using file
			} catch (err) {
				importErrors = [`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`];
				parsedPersonnel = [];
			}
		};

		reader.readAsArrayBuffer(file);
	}

	function clearFileUpload() {
		uploadedFileName = '';
		parsedPersonnel = [];
		importErrors = [];
		if (fileInput) fileInput.value = '';
	}

	function toggleSelect(id: string) {
		const newSet = new Set(selectedIds);
		if (newSet.has(id)) {
			newSet.delete(id);
		} else {
			newSet.add(id);
		}
		selectedIds = newSet;
	}

	function selectAll() {
		selectedIds = new Set(allPersonnel.map((p) => p.id));
	}

	function selectNone() {
		selectedIds = new Set();
	}

	function selectGroup(groupName: string) {
		const groupPersonnel = allPersonnel.filter((p) => p.groupName === groupName);
		const newSet = new Set(selectedIds);
		for (const p of groupPersonnel) {
			newSet.add(p.id);
		}
		selectedIds = newSet;
	}

	function handleDelete() {
		if (selectedIds.size > 0) {
			if (confirm(`Delete ${selectedIds.size} personnel?\n\nThis will also remove all their schedule entries. This action cannot be undone.`)) {
				onBulkDelete([...selectedIds]);
				selectedIds = new Set();
			}
		}
	}

	$effect(() => {
		if (importText) {
			parseImportText();
		} else {
			parsedPersonnel = [];
			importErrors = [];
		}
	});
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<div class="modal bulk-modal" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h2>Bulk Personnel Management</h2>
			<button class="btn btn-secondary btn-sm close-btn" onclick={onClose} aria-label="Close">&times;</button>
		</div>

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
					<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
				</svg>
				Delete
			</button>
		</div>

		<div class="modal-body">
			{#if activeTab === 'import'}
				<div class="import-section">
					<!-- File Upload -->
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
								<button class="btn btn-secondary btn-sm" onclick={clearFileUpload}>Clear</button>
							{/if}
						</div>
						<p class="format-hint">Columns: Rank, Last Name, First Name, MOS, Role, Group</p>
					</div>

					<div class="divider">
						<span>or paste text</span>
					</div>

					<div class="format-info">
						<h4>Paste Data</h4>
						<p>One person per line, comma-separated:</p>
						<code>Rank, Last Name, First Name, MOS, Role, Group</code>
						<p class="hint">MOS, Role, and Group are optional</p>
					</div>

					<div class="example-box">
						<div class="example-header">
							<span>Example</span>
							<button class="btn btn-secondary btn-sm" onclick={() => { importText = exampleFormat; uploadedFileName = ''; }}>
								Use Example
							</button>
						</div>
						<pre>{exampleFormat}</pre>
					</div>

					<div class="form-group">
						<label class="label" for="importText">Personnel Data</label>
						<textarea
							id="importText"
							class="input import-textarea"
							bind:value={importText}
							placeholder="Paste personnel data here..."
							rows="6"
							disabled={!!uploadedFileName}
						></textarea>
					</div>

					{#if importErrors.length > 0}
						<div class="warnings-box">
							<div class="warnings-header">
								<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
									<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
								</svg>
								Warnings ({importErrors.length})
							</div>
							<ul>
								{#each importErrors as error}
									<li>{error}</li>
								{/each}
							</ul>
						</div>
					{/if}

					{#if parsedPersonnel.length > 0}
						<div class="preview-box">
							<div class="preview-header">
								<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
									<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
								</svg>
								Ready to Import ({parsedPersonnel.length})
							</div>
							<div class="preview-list">
								{#each parsedPersonnel as person}
									<div class="preview-item">
										<span class="preview-rank">{person.rank}</span>
										<span class="preview-name">{person.lastName}, {person.firstName}</span>
										{#if person.mos}
											<span class="preview-mos">{person.mos}</span>
										{/if}
										{#if person.clinicRole}
											<span class="preview-role">{person.clinicRole}</span>
										{/if}
										{#if person.groupName}
											<span class="preview-group">{person.groupName}</span>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
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
						{#each personnelByGroup as grp}
							{#if grp.personnel.length > 0}
								<button
									class="group-chip"
									onclick={() => selectGroup(grp.group)}
								>
									{grp.group || 'Unassigned'}
									<span class="chip-count">{grp.personnel.length}</span>
								</button>
							{/if}
						{/each}
					</div>

					<div class="personnel-checklist">
						{#each personnelByGroup as grp}
							{#if grp.personnel.length > 0}
								<div class="checklist-group">
									<div class="checklist-header">{grp.group || 'Unassigned'}</div>
									<div class="checklist-items">
										{#each grp.personnel as person}
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
							<strong>{selectedIds.size}</strong> personnel selected for deletion
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="modal-footer">
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			{#if activeTab === 'import'}
				<button
					class="btn btn-primary"
					onclick={handleImport}
					disabled={parsedPersonnel.length === 0}
				>
					Import {parsedPersonnel.length} Personnel
				</button>
			{:else}
				<button
					class="btn btn-danger"
					onclick={handleDelete}
					disabled={selectedIds.size === 0}
				>
					Delete {selectedIds.size} Personnel
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.bulk-modal {
		width: 600px;
		max-width: 95vw;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.close-btn {
		font-size: 1.25rem;
		line-height: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
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

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-lg);
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

	.warnings-box {
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.warnings-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-weight: 600;
		color: #dc2626;
		margin-bottom: var(--spacing-xs);
	}

	.warnings-box ul {
		margin: 0;
		padding-left: var(--spacing-lg);
		font-size: var(--font-size-sm);
		color: #b91c1c;
	}

	.preview-box {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
	}

	.preview-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-weight: 600;
		color: #22c55e;
		margin-bottom: var(--spacing-xs);
	}

	.preview-list {
		max-height: 200px;
		overflow-y: auto;
	}

	.preview-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) 0;
		font-size: var(--font-size-sm);
		border-bottom: 1px solid rgba(0, 0, 0, 0.05);
	}

	.preview-item:last-child {
		border-bottom: none;
	}

	.preview-rank {
		font-weight: 600;
		color: var(--color-primary);
	}

	.preview-name {
		font-weight: 500;
	}

	.preview-mos {
		color: var(--color-primary);
	}

	.preview-role,
	.preview-group {
		color: var(--color-text-muted);
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
		color: white;
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
