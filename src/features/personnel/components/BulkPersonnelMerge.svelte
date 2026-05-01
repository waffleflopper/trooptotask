<script lang="ts">
	import type { Group } from '$lib/stores/groups.svelte';
	import type { Personnel } from '$lib/types';
	import { ALL_RANKS } from '$lib/types';
	import BulkImportTable from '$lib/components/ui/BulkImportTable.svelte';
	import { PERSONNEL_COLUMNS, detectHeaderRow } from '$lib/utils/columnMapping';
	import { parseCSVText, parseFile } from '$lib/utils/csvParser';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		groups: Group[];
		onComplete: () => void;
	}

	let { orgId, personnel, groups, onComplete }: Props = $props();

	type MergeState = 'input' | 'preview' | 'merging' | 'results';

	interface MergeMessage {
		index: number;
		message: string;
	}

	interface MergeResult {
		matched: Array<{ index: number; personnelId: string }>;
		updated: Array<Record<string, unknown>>;
		skipped: MergeMessage[];
		ambiguous: MergeMessage[];
		errors: MergeMessage[];
	}

	function extractErrorMessage(payload: unknown, fallback: string): string {
		if (typeof payload === 'string') {
			return payload.trim() || fallback;
		}

		if (!payload || typeof payload !== 'object') {
			return fallback;
		}

		const record = payload as Record<string, unknown>;
		for (const key of ['message', 'error', 'detail', 'title']) {
			const value = record[key];
			if (typeof value === 'string' && value.trim()) {
				return value;
			}
			if (value && typeof value === 'object') {
				const nestedMessage = extractErrorMessage(value, '');
				if (nestedMessage) return nestedMessage;
			}
		}

		const errors = record.errors;
		if (typeof errors === 'string' && errors.trim()) {
			return errors;
		}
		if (Array.isArray(errors)) {
			for (const entry of errors) {
				const nestedMessage = extractErrorMessage(entry, '');
				if (nestedMessage) return nestedMessage;
			}
		}

		return fallback;
	}

	let mergeStep = $state<MergeState>('input');
	let importText = $state('');
	let fileRows = $state<string[][]>([]);
	let uploadedFileName = $state('');
	let fileInput: HTMLInputElement | undefined = $state();
	let textRows = $state<string[][]>([]);
	let textError = $state('');
	let parseRequestId = 0;
	let mergeResult = $state<MergeResult | null>(null);
	let isSubmitting = $state(false);
	let tableRef = $state<ReturnType<typeof BulkImportTable>>();

	const exampleCsv = `Rank,Last Name,First Name,ETS,PCS / DEROS
SGT,Smith,Jamie,2027-05-01,
SSG,Jones,Pat,,2026-11-30`;

	$effect(() => {
		const currentText = uploadedFileName ? '' : importText;
		const requestId = ++parseRequestId;

		if (!currentText.trim()) {
			textRows = [];
			textError = '';
			return;
		}

		textRows = [];
		textError = '';

		let active = true;
		parseCSVText(currentText)
			.then((rows) => {
				if (!active || requestId !== parseRequestId) return;
				textRows = rows;
			})
			.catch((err) => {
				if (!active || requestId !== parseRequestId) return;
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

	function findMatches(row: Record<string, string>): Personnel[] {
		const rank = (row.rank ?? '').trim().toLowerCase();
		const lastName = (row.lastName ?? '').trim().toLowerCase();
		const firstName = (row.firstName ?? '').trim().toLowerCase();
		const groupName = (row.groupName ?? '').trim().toLowerCase();

		let matches = personnel.filter(
			(person) =>
				person.rank.toLowerCase() === rank &&
				person.lastName.toLowerCase() === lastName &&
				person.firstName.toLowerCase() === firstName &&
				!person.archivedAt
		);

		if (matches.length > 1 && groupName) {
			matches = matches.filter((person) => person.groupName.toLowerCase() === groupName);
		}

		return matches;
	}

	function validateRow(row: Record<string, string>) {
		const cellErrors: Record<string, string> = {};
		const cellWarnings: Record<string, string> = {};

		const rank = (row.rank ?? '').trim();
		if (!rank) {
			cellErrors.rank = 'Rank is required';
		} else if (!ALL_RANKS.some((value) => value.toLowerCase() === rank.toLowerCase())) {
			cellErrors.rank = `"${rank}" is not a valid rank. Valid ranks: ${ALL_RANKS.join(', ')}`;
		}

		const lastName = (row.lastName ?? '').trim();
		if (!lastName) cellErrors.lastName = 'Last name is required';

		const firstName = (row.firstName ?? '').trim();
		if (!firstName) cellErrors.firstName = 'First name is required';

		const groupName = (row.groupName ?? '').trim();
		if (groupName && !groups.some((group) => group.name.toLowerCase() === groupName.toLowerCase())) {
			cellWarnings.groupName = `"${groupName}" doesn't match a known group. Matching will ignore group disambiguation.`;
		}

		if (!(row.ets ?? '').trim() && !(row.deros ?? '').trim()) {
			cellErrors.ets = 'Provide ETS or PCS / DEROS';
		}

		if (rank && lastName && firstName) {
			const matches = findMatches(row);
			if (matches.length === 0) {
				cellErrors.lastName = 'No active personnel row matches this record';
			} else if (matches.length > 1) {
				cellErrors.lastName = 'Multiple people match this row. Add Group to disambiguate.';
			}
		}

		return {
			valid: Object.keys(cellErrors).length === 0,
			cellErrors,
			cellWarnings
		};
	}

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
			textError = err instanceof Error ? err.message : 'Failed to parse uploaded file';
		}
	}

	function clearFile() {
		uploadedFileName = '';
		fileRows = [];
		if (fileInput) fileInput.value = '';
	}

	function goToPreview() {
		mergeStep = 'preview';
	}

	function backToInput() {
		mergeStep = 'input';
	}

	async function runMerge() {
		if (isSubmitting || !tableRef) return;
		const checkedRows = tableRef.getCheckedRows();
		if (checkedRows.length === 0) return;

		isSubmitting = true;
		mergeStep = 'merging';

		try {
			const response = await fetch(`/org/${orgId}/api/personnel/merge`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ records: checkedRows })
			});
			let data: MergeResult | null = null;
			try {
				data = (await response.json()) as MergeResult;
			} catch {
				data = null;
			}

			if (!response.ok) {
				const message = extractErrorMessage(
					data,
					`Merge failed (${response.status}${response.statusText ? ` ${response.statusText}` : ''})`
				);
				mergeResult = {
					matched: [],
					updated: [],
					skipped: [],
					ambiguous: [],
					errors: [{ index: -1, message }]
				};
				mergeStep = 'results';
				return;
			}

			mergeResult = {
				matched: data?.matched ?? [],
				updated: data?.updated ?? [],
				skipped: data?.skipped ?? [],
				ambiguous: data?.ambiguous ?? [],
				errors: data?.errors ?? []
			};
			mergeStep = 'results';
		} catch (err) {
			mergeResult = {
				matched: [],
				updated: [],
				skipped: [],
				ambiguous: [],
				errors: [{ index: -1, message: err instanceof Error ? err.message : 'Merge failed' }]
			};
			mergeStep = 'results';
		} finally {
			isSubmitting = false;
		}
	}

	function useExample() {
		importText = exampleCsv;
		uploadedFileName = '';
	}
</script>

{#if mergeStep === 'input'}
	<div class="merge-section">
		<div class="merge-intro">
			<h3>Bulk Update Existing Personnel</h3>
			<p>Backfill `ETS` and `PCS / DEROS` on personnel who already exist in the organization.</p>
			<p class="hint">
				Matching uses exact Rank + Last Name + First Name. Add Group when duplicates need disambiguation.
			</p>
		</div>

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
					id="mergeFileUpload"
				/>
				<button class="btn btn-secondary upload-btn" type="button" onclick={() => fileInput?.click()}
					>Choose File</button
				>
				{#if uploadedFileName}
					<span class="file-name">{uploadedFileName}</span>
					<button class="btn btn-secondary btn-sm" type="button" onclick={clearFile}>Clear</button>
				{/if}
			</div>
			<p class="format-hint">Columns: Rank, Last Name, First Name, Group, ETS, PCS / DEROS</p>
		</div>

		<div class="divider"><span>or paste text</span></div>

		<div class="format-info">
			<h4>Paste Data</h4>
			<p>Use a header row with personnel identity columns plus the dates you want to backfill.</p>
			<code>Rank, Last Name, First Name, Group, ETS, PCS / DEROS</code>
			<p class="hint">Group is optional unless you need it to break a duplicate match.</p>
		</div>

		<div class="example-box">
			<div class="example-header">
				<span>Example</span>
				<button class="btn btn-secondary btn-sm" type="button" onclick={useExample}>Use Example</button>
			</div>
			<pre>{exampleCsv}</pre>
		</div>

		<div class="form-group">
			<label class="label" for="mergeImportText">Personnel Data</label>
			<textarea
				id="mergeImportText"
				class="input import-textarea"
				bind:value={importText}
				placeholder="Paste personnel update data here..."
				rows={6}
				disabled={!!uploadedFileName}
			></textarea>
		</div>

		{#if textError}
			<p class="text-error">{textError}</p>
		{/if}

		<div class="actions">
			<button class="btn btn-primary" type="button" onclick={goToPreview} disabled={rawRows.length === 0}>
				Preview {dataRowCount > 0 ? dataRowCount : ''} Rows
			</button>
		</div>
	</div>
{:else if mergeStep === 'preview'}
	<div class="merge-preview">
		<p class="hint preview-hint">
			Only checked rows with a unique personnel match and at least one update value will be submitted.
		</p>
		<BulkImportTable bind:this={tableRef} {rawRows} columnDefs={PERSONNEL_COLUMNS} {validateRow} />
		<div class="actions">
			<button class="btn btn-secondary" type="button" onclick={backToInput}>Back</button>
			<button class="btn btn-primary" type="button" onclick={runMerge} disabled={isSubmitting}>Apply Updates</button>
		</div>
	</div>
{:else if mergeStep === 'merging'}
	<div class="importing-state">
		<div class="spinner"></div>
		<p>Applying personnel updates...</p>
	</div>
{:else if mergeStep === 'results' && mergeResult}
	<div class="results-section">
		<h3>Merge Results</h3>
		<p class="hint">Found rows can be higher than changed rows when values are already current.</p>
		<div class="summary-grid">
			<div class="summary-card"><strong>{mergeResult.matched.length}</strong><span>person rows found</span></div>
			<div class="summary-card"><strong>{mergeResult.updated.length}</strong><span>values changed</span></div>
			<div class="summary-card"><strong>{mergeResult.skipped.length}</strong><span>skipped</span></div>
			<div class="summary-card"><strong>{mergeResult.ambiguous.length}</strong><span>ambiguous</span></div>
			<div class="summary-card"><strong>{mergeResult.errors.length}</strong><span>failed</span></div>
		</div>

		{#if mergeResult.skipped.length > 0}
			<div class="result-list">
				<h4>Skipped</h4>
				<ul>
					{#each mergeResult.skipped as item, index (index)}
						<li>
							{#if item.index >= 0}Row {item.index + 1}:
							{/if}{item.message}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if mergeResult.ambiguous.length > 0}
			<div class="result-list">
				<h4>Ambiguous</h4>
				<ul>
					{#each mergeResult.ambiguous as item, index (index)}
						<li>
							{#if item.index >= 0}Row {item.index + 1}:
							{/if}{item.message}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if mergeResult.errors.length > 0}
			<div class="result-list result-list--error">
				<h4>Failed</h4>
				<ul>
					{#each mergeResult.errors as item, index (index)}
						<li>
							{#if item.index >= 0}Row {item.index + 1}:
							{/if}{item.message}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="actions">
			<button class="btn btn-primary" type="button" onclick={onComplete}>Done</button>
		</div>
	</div>
{/if}

<style>
	.merge-section,
	.merge-preview,
	.results-section,
	.importing-state {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.merge-intro h3,
	.results-section h3,
	.upload-section h4,
	.format-info h4,
	.result-list h4 {
		margin: 0;
	}

	.merge-intro p {
		margin: 0;
	}

	.hint,
	.format-hint,
	.preview-hint {
		color: var(--text-secondary);
	}

	.upload-section {
		padding: var(--sp-5);
		background: color-mix(in srgb, var(--surface-subtle) 70%, var(--surface-panel) 30%);
		border-radius: var(--radius-md);
		border: 1px dashed color-mix(in srgb, var(--border-default) 88%, var(--ink-35) 12%);
	}

	.upload-row,
	.example-header,
	.actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.file-input {
		display: none;
	}

	.file-name {
		font-weight: var(--font-weight-medium);
		color: var(--text-primary);
	}

	.divider {
		position: relative;
		text-align: center;
		color: var(--text-tertiary);
	}

	.divider::before {
		content: '';
		position: absolute;
		inset: 50% 0 auto;
		border-top: var(--border-thin);
	}

	.divider span {
		position: relative;
		padding: 0 var(--sp-3);
		background: var(--surface-panel);
	}

	.format-info,
	.example-box,
	.result-list,
	.summary-card {
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
	}

	.example-box pre,
	.format-info code {
		margin: 0;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.import-textarea {
		min-height: 180px;
		font-family: var(--font-mono);
	}

	.text-error {
		margin: 0;
		color: var(--red-dark);
	}

	.actions {
		justify-content: flex-end;
	}

	.importing-state {
		align-items: center;
		justify-content: center;
		padding: var(--sp-8) 0;
	}

	.spinner {
		width: 28px;
		height: 28px;
		border: 3px solid var(--border-default);
		border-top-color: var(--amber);
		border-radius: 999px;
		animation: spin 1s linear infinite;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--sp-3);
	}

	.summary-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		align-items: flex-start;
	}

	.summary-card strong {
		font-size: var(--text-xl);
	}

	.result-list ul {
		margin: var(--sp-2) 0 0;
		padding-left: var(--sp-4);
	}

	.result-list--error {
		background: color-mix(in srgb, var(--red-light) 55%, var(--surface-panel) 45%);
		border-color: color-mix(in srgb, var(--red) 55%, var(--border-default) 45%);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
