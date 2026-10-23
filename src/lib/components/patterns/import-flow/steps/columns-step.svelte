<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { cn } from '$lib/utils.js';
	import { HEADER_SCAN_ROWS, headerKey, type ColumnTarget, type HeaderKey } from '../workbookSource';
	import { plural, type FlowSession } from '../flowTypes';
	import { questionKey, type QuestionKey } from '../types';

	let { session, onBack }: { session: FlowSession; onBack: () => void } = $props();

	const ROWS = { one: 'row', other: 'rows' };
	const PREVIEW_DATA_ROWS = 8;

	const phase = $derived(session.phase.step === 'columns' ? session.phase : null);
	const file = $derived(session.file);
	const layout = $derived(session.layout);
	let chosenPreview = $state<number | null>(null);
	const previewIndex = $derived(chosenPreview ?? Math.max(0, layout?.sheets.findIndex((sheet) => sheet.included) ?? 0));
	const sheet = $derived(file?.sheets[previewIndex]);
	const sheetLayout = $derived(layout?.sheets[previewIndex]);
	const headerRow = $derived(sheetLayout?.headerRow ?? null);
	const headers = $derived(headerRow === null ? [] : (sheet?.rows[headerRow] ?? []));
	const previewRows = $derived(
		sheet?.rows.slice(0, headerRow === null ? HEADER_SCAN_ROWS : headerRow + 1 + PREVIEW_DATA_ROWS) ?? []
	);
	const columnCount = $derived(Math.max(headers.length, ...previewRows.map((row) => row.length)));
	const sheetRows = $derived(new Set(session.sourceRows.map((row) => `${row.sheetIndex}:${row.rowNumber}`)));
	const rowsPerSheet = $derived(
		[...sheetRows].reduce<Map<number, number>>((counts, key) => {
			const sheetIndex = Number(key.split(':')[0]);
			return counts.set(sheetIndex, (counts.get(sheetIndex) ?? 0) + 1);
		}, new Map())
	);
	const reviewNoun = $derived(session.sourceRows.length > sheetRows.size ? session.lane.noun : ROWS);
	const includedCount = $derived(layout?.sheets.filter((item) => item.included).length ?? 0);

	const pivotReference = $derived.by(() => {
		const field = session.lane.pivot?.field;
		const entry = field && Object.entries(session.lane.references).find(([, item]) => item.reads.includes(field));
		return entry ? { name: entry[0], reference: entry[1], field } : null;
	});

	const targetOptions = $derived([
		...Object.entries(session.lane.columns).map(([field, column]) => ({
			value: `field:${field}`,
			label: column.label
		})),
		...(session.lane.splitters ?? []).map((splitter, index) => ({ value: `split:${index}`, label: splitter.label })),
		...(session.lane.pivot && !pivotReference
			? [{ value: 'pivot', label: `${session.lane.pivot.label} (one per column)` }]
			: [])
	]);

	function pivotChoice(header: string): { key: QuestionKey; matched?: string; chosen?: string } | null {
		if (!pivotReference) return null;
		const lookup = pivotReference.reference.key({ [pivotReference.field]: header.trim() });
		if (!lookup) return null;
		const match = pivotReference.reference.find(lookup.key);
		const key = questionKey({ reference: pivotReference.name, key: lookup.key });
		const answer = session.answers.get(key);
		const matched = match.kind === 'one' ? match.option.id : undefined;
		return { key, matched, chosen: answer ? (answer.kind === 'pick' ? answer.optionId : undefined) : matched };
	}

	function chooseTarget(header: string, value: string) {
		const key = headerKey(header);
		if (!value.startsWith('pivot:')) {
			session.setColumnTarget(key, parseTarget(value));
			return;
		}
		session.setColumnTarget(key, { kind: 'pivot' });
		const choice = pivotChoice(header);
		const optionId = value.slice(6);
		if (choice) session.answer(choice.key, optionId === choice.matched ? null : { kind: 'pick', optionId });
	}

	function targetValue(target: ColumnTarget | undefined, header = ''): string {
		if (!target || target.kind === 'ignore') return 'ignore';
		if (target.kind === 'field') return `field:${target.field}`;
		if (target.kind === 'split') return `split:${target.splitter}`;
		const chosen = pivotChoice(header)?.chosen;
		return chosen ? `pivot:${chosen}` : 'pivot';
	}

	function parseTarget(value: string): ColumnTarget {
		if (value.startsWith('field:')) return { kind: 'field', field: value.slice(6) };
		if (value.startsWith('split:')) return { kind: 'split', splitter: Number(value.slice(6)) };
		if (value === 'pivot') return { kind: 'pivot' };
		return { kind: 'ignore' };
	}

	const usage = $derived.by(() => {
		if (!file || !layout) return { used: 0, total: 0, ignored: [] as string[], unmatched: [] as string[] };
		const seen: Record<HeaderKey, string> = {};
		layout.sheets.forEach((item, index) => {
			if (!item.included || item.headerRow === null) return;
			for (const cell of file.sheets[index].rows[item.headerRow] ?? [])
				if (cell.trim()) seen[headerKey(cell)] = cell.trim();
		});
		const found = Object.entries(seen) as [HeaderKey, string][];
		const ignored = found.filter(([key]) => targetValue(layout.columns.get(key)) === 'ignore');
		const unmatched = found.filter(([key, label]) => targetValue(layout.columns.get(key), label) === 'pivot');
		return {
			used: found.length - ignored.length,
			total: found.length,
			ignored: ignored.map(([, label]) => label),
			unmatched: pivotReference ? unmatched.map(([, label]) => label) : []
		};
	});
</script>

{#if file && layout && sheet && sheetLayout}
	<div class="grid min-w-0 gap-5">
		<div class="flex flex-wrap items-center gap-3">
			<FileSpreadsheetIcon class="size-5 text-muted-foreground" aria-hidden="true" />
			<span class="min-w-0 truncate font-medium">{file.name}</span>
			<Button variant="ghost" size="sm" onclick={() => session.goTo('file')}>Replace file</Button>
		</div>

		<section class="grid gap-2" aria-labelledby="import-sheets-heading">
			<h2
				id="import-sheets-heading"
				class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"
			>
				Read sheets
			</h2>
			<ul class="flex flex-wrap gap-2">
				{#each file.sheets as item, index (item.index)}
					{@const settings = layout.sheets[index]}
					<li
						class={cn(
							'flex items-center gap-2 rounded-md border py-1 pr-1 pl-2.5 text-sm',
							index === previewIndex && 'border-foreground'
						)}
					>
						<Checkbox
							checked={settings.included}
							aria-label="Read {item.name}"
							onCheckedChange={(checked) => session.setSheetIncluded(index, checked === true)}
						/>
						<Button
							variant="ghost"
							size="xs"
							aria-pressed={index === previewIndex}
							onclick={() => (chosenPreview = index)}
						>
							<span class={cn('font-medium', !settings.included && 'text-muted-foreground')}>{item.name}</span>
							<span class="text-muted-foreground">
								{settings.included ? plural(rowsPerSheet.get(item.index) ?? 0, ROWS) : (settings.reason ?? 'Not read')}
							</span>
						</Button>
					</li>
				{/each}
			</ul>
			<p class="text-sm text-muted-foreground">
				{includedCount === 1 ? 'One sheet' : `${includedCount} sheets`} read · {plural(sheetRows.size, ROWS)}
			</p>
		</section>

		<section class="grid min-w-0 gap-2" aria-labelledby="import-preview-heading">
			<div class="flex flex-wrap items-end justify-between gap-2">
				<h2 id="import-preview-heading" class="text-sm font-semibold">{sheet.name}</h2>
				<p class="text-xs text-muted-foreground">Choose the row that holds the column names.</p>
			</div>
			<div class="min-w-0 overflow-x-auto rounded-md border">
				<table class="w-full border-collapse text-sm">
					<thead>
						<tr class="bg-muted/50">
							<th
								scope="col"
								class="w-24 px-2 py-2 text-left font-mono text-xs font-semibold text-muted-foreground uppercase"
							>
								Import as
							</th>
							{#each { length: columnCount }, column (column)}
								{@const header = headers[column] ?? ''}
								<th scope="col" class="min-w-36 px-2 py-2 text-left font-normal">
									{#if header.trim()}
										{@const value = targetValue(layout.columns.get(headerKey(header)), header)}
										<NativeSelect.Root
											size="sm"
											class="w-full"
											aria-label="Import {header} as"
											{value}
											onchange={(event) => chooseTarget(header, event.currentTarget.value)}
										>
											{#each targetOptions as option (option.value)}
												<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
											{/each}
											{#if pivotReference && session.lane.pivot}
												<NativeSelect.OptGroup label="{session.lane.pivot.label} (one per column)">
													{#if value === 'pivot'}
														<NativeSelect.Option value="pivot"
															>Pick a {pivotReference.reference.label}</NativeSelect.Option
														>
													{/if}
													{#each pivotReference.reference.options as option (option.id)}
														<NativeSelect.Option value="pivot:{option.id}">{option.label}</NativeSelect.Option>
													{/each}
												</NativeSelect.OptGroup>
											{/if}
											<NativeSelect.Option value="ignore">Don't import</NativeSelect.Option>
										</NativeSelect.Root>
									{/if}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each previewRows as cells, rowIndex (rowIndex)}
							{@const isHeader = rowIndex === headerRow}
							{@const aboveHeader = headerRow !== null && rowIndex < headerRow}
							<tr
								class={cn(
									'border-t',
									isHeader && 'bg-accent/15 font-semibold',
									aboveHeader &&
										'bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_6px,transparent_6px_12px)] text-muted-foreground'
								)}
							>
								<th scope="row" class="px-2 py-1.5 text-left font-normal whitespace-nowrap">
									{#if isHeader}
										<Badge variant="warning">Header</Badge>
									{:else if rowIndex < HEADER_SCAN_ROWS}
										<Button
											variant="ghost"
											size="xs"
											class="font-mono text-muted-foreground"
											aria-label="Use row {rowIndex + 1} as the header"
											onclick={() => session.setHeaderRow(previewIndex, rowIndex)}
										>
											{rowIndex + 1}
										</Button>
									{:else}
										<span class="px-2 font-mono text-xs text-muted-foreground">{rowIndex + 1}</span>
									{/if}
								</th>
								{#each { length: columnCount }, column (column)}
									<td class="max-w-56 truncate px-2 py-1.5">{cells[column] ?? ''}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<footer class="flex flex-wrap items-center gap-x-4 gap-y-3 border-t pt-4">
			<p class="min-w-0 flex-1 basis-64 text-sm text-muted-foreground" role="status">
				{#if session.columnBlockers.length}
					<span class="font-medium text-danger-foreground">{session.columnBlockers[0]}</span>
				{:else if phase?.error}
					<span class="font-medium text-danger-foreground">{phase.error}</span>
				{:else}
					{usage.used} of {usage.total} columns used
					{#if usage.ignored.length}· {usage.ignored.join(', ')} not imported{/if}
					{#if usage.unmatched.length && pivotReference}
						· <span class="text-warning-foreground"
							>Pick a {pivotReference.reference.label} for {usage.unmatched.join(', ')} here or in Review</span
						>
					{/if}
				{/if}
			</p>
			<Button variant="outline" onclick={onBack}>Back</Button>
			<Button
				disabled={session.columnBlockers.length > 0 || phase?.preparing}
				aria-busy={phase?.preparing || undefined}
				onclick={() => session.goTo('review')}
			>
				Review {plural(session.sourceRows.length, reviewNoun)}
				{#if phase?.preparing}<Spinner data-icon="inline-end" />{:else}<ArrowRightIcon data-icon="inline-end" />{/if}
			</Button>
		</footer>
	</div>
{/if}
