<script lang="ts">
	import type { Group } from '$lib/stores/groups.svelte';
	import type { Personnel } from '$lib/types';
	import { ALL_RANKS } from '$lib/types';
	import BulkImportTable from '$lib/components/ui/BulkImportTable.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { PERSONNEL_COLUMNS, detectHeaderRow } from '$lib/utils/columnMapping';
	import { parseFile } from '$lib/utils/csvParser';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		groups: Group[];
		onComplete: () => void;
		showInputActions?: boolean;
		footerState?: {
			step: MergeState;
			disabled: boolean;
			label: string;
		};
	}

	type MergeState = 'input' | 'preview' | 'merging' | 'results';

	let {
		orgId,
		personnel,
		groups,
		onComplete,
		showInputActions = true,
		footerState = $bindable({ step: 'input', disabled: true, label: 'Preview Rows' })
	}: Props = $props();

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
	let fileRows = $state<string[][]>([]);
	let uploadedFileName = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);
	let importError = $state('');
	let mergeResult = $state<MergeResult | null>(null);
	let isSubmitting = $state(false);
	let tableRef = $state<ReturnType<typeof BulkImportTable>>();

	const rawRows = $derived(fileRows);
	const dataRowCount = $derived(
		rawRows.length > 0 && detectHeaderRow(rawRows[0], PERSONNEL_COLUMNS) ? rawRows.length - 1 : rawRows.length
	);
	const previewLabel = $derived(`Preview ${dataRowCount > 0 ? dataRowCount : ''} Rows`);

	$effect(() => {
		footerState = {
			step: mergeStep,
			disabled: rawRows.length === 0,
			label: previewLabel
		};
	});

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
		mergeStep = 'preview';
	}

	export function previewRows() {
		goToPreview();
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
</script>

{#if mergeStep === 'input'}
	<div class="grid gap-4">
		<div class="grid gap-2">
			<h3 class="text-base font-medium">Bulk Update Existing Personnel</h3>
			<p class="text-sm text-muted-foreground">
				Backfill `ETS` and `PCS / DEROS` on personnel who already exist in the organization.
			</p>
			<p class="text-sm text-muted-foreground">
				Matching uses exact Rank + Last Name + First Name. Add Group when duplicates need disambiguation.
			</p>
		</div>

		<section class="grid gap-3 rounded-lg border border-dashed bg-muted/25 p-4">
			<div class="grid gap-1">
				<h4 class="font-medium">Upload File</h4>
				<p class="text-sm text-muted-foreground">Upload an Excel (.xlsx) or CSV file.</p>
			</div>
			<Input id="mergeFileUpload" type="file" accept=".xlsx,.csv" onchange={handleFileUpload} bind:ref={fileInput} />
			{#if uploadedFileName}
				<div class="flex items-center justify-between gap-2">
					<span class="truncate font-mono text-xs">{uploadedFileName}</span>
					<Button variant="outline" size="sm" type="button" onclick={clearFile}>Clear</Button>
				</div>
			{/if}
			<p class="text-xs text-muted-foreground">Columns: Rank, Last Name, First Name, Group, ETS, PCS / DEROS</p>
		</section>

		{#if importError}
			<p class="text-sm text-destructive">{importError}</p>
		{/if}

		{#if showInputActions}
			<div class="flex justify-end">
				<Button type="button" onclick={goToPreview} disabled={rawRows.length === 0}>
					{previewLabel}
				</Button>
			</div>
		{/if}
	</div>
{:else if mergeStep === 'preview'}
	<div class="grid gap-4">
		<p class="text-sm text-muted-foreground">
			Only checked rows with a unique personnel match and at least one update value will be submitted.
		</p>
		<BulkImportTable bind:this={tableRef} {rawRows} columnDefs={PERSONNEL_COLUMNS} {validateRow} />
		<div class="flex justify-end gap-2">
			<Button variant="outline" type="button" onclick={backToInput}>Back</Button>
			<Button type="button" onclick={runMerge} disabled={isSubmitting}>Apply Updates</Button>
		</div>
	</div>
{:else if mergeStep === 'merging'}
	<div class="grid justify-items-center gap-4 py-12 text-muted-foreground">
		<Spinner />
		<p>Applying personnel updates...</p>
	</div>
{:else if mergeStep === 'results' && mergeResult}
	<div class="grid gap-4">
		<div class="grid gap-1">
			<h3 class="text-base font-medium">Merge Results</h3>
			<p class="text-sm text-muted-foreground">
				Found rows can be higher than changed rows when values are already current.
			</p>
		</div>
		<div class="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
			<div class="summary-card grid gap-1 rounded-lg border bg-muted/40 p-4">
				<strong class="text-xl">{mergeResult.matched.length}</strong><span class="text-sm text-muted-foreground"
					>person rows found</span
				>
			</div>
			<div class="summary-card grid gap-1 rounded-lg border bg-muted/40 p-4">
				<strong class="text-xl">{mergeResult.updated.length}</strong><span class="text-sm text-muted-foreground"
					>values changed</span
				>
			</div>
			<div class="summary-card grid gap-1 rounded-lg border bg-muted/40 p-4">
				<strong class="text-xl">{mergeResult.skipped.length}</strong><span class="text-sm text-muted-foreground"
					>skipped</span
				>
			</div>
			<div class="summary-card grid gap-1 rounded-lg border bg-muted/40 p-4">
				<strong class="text-xl">{mergeResult.ambiguous.length}</strong><span class="text-sm text-muted-foreground"
					>ambiguous</span
				>
			</div>
			<div class="summary-card grid gap-1 rounded-lg border bg-muted/40 p-4">
				<strong class="text-xl">{mergeResult.errors.length}</strong><span class="text-sm text-muted-foreground"
					>failed</span
				>
			</div>
		</div>

		{#if mergeResult.skipped.length > 0}
			<div class="rounded-lg border bg-muted/40 p-4">
				<h4 class="font-medium">Skipped</h4>
				<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
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
			<div class="rounded-lg border bg-muted/40 p-4">
				<h4 class="font-medium">Ambiguous</h4>
				<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
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
			<div class="rounded-lg border border-destructive/25 bg-destructive/10 p-4">
				<h4 class="font-medium text-destructive">Failed</h4>
				<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
					{#each mergeResult.errors as item, index (index)}
						<li>
							{#if item.index >= 0}Row {item.index + 1}:
							{/if}{item.message}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="flex justify-end">
			<Button type="button" onclick={onComplete}>Done</Button>
		</div>
	</div>
{/if}
