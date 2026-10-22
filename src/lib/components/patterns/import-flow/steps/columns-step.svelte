<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import { cn } from '$lib/utils.js';
	import { HEADER_SCAN_ROWS, headerKey, type ColumnTarget, type HeaderKey } from '../workbookSource';
	import { plural, type FlowSession } from '../flowTypes';

	let { session, onBack }: { session: FlowSession; onBack: () => void } = $props();

	const ROWS = { one: 'row', other: 'rows' };
	const PREVIEW_DATA_ROWS = 8;

	const file = $derived(session.file);
	const layout = $derived(session.layout);
	let chosenPreview = $state<number | null>(null);
	const previewIndex = $derived(chosenPreview ?? Math.max(0, layout?.sheets.findIndex((sheet) => sheet.included) ?? 0));
	const sheet = $derived(file?.sheets[previewIndex]);
	const sheetLayout = $derived(layout?.sheets[previewIndex]);
	const headerRow = $derived(sheetLayout?.headerRow ?? null);
	const headers = $derived(headerRow === null ? [] : (sheet?.rows[headerRow] ?? []));
	const previewRows = $derived(sheet?.rows.slice(0, (headerRow ?? 0) + 1 + PREVIEW_DATA_ROWS) ?? []);
	const columnCount = $derived(Math.max(headers.length, ...previewRows.map((row) => row.length)));
	const rowsPerSheet = $derived(
		session.sourceRows.reduce<Map<number, number>>(
			(counts, row) => counts.set(row.sheetIndex, (counts.get(row.sheetIndex) ?? 0) + 1),
			new Map()
		)
	);
	const includedCount = $derived(layout?.sheets.filter((item) => item.included).length ?? 0);

	const targetOptions = $derived([
		...Object.entries(session.lane.columns).map(([field, column]) => ({
			value: `field:${field}`,
			label: column.label
		})),
		...(session.lane.splitters ?? []).map((splitter, index) => ({ value: `split:${index}`, label: splitter.label })),
		...(session.lane.pivot ? [{ value: 'pivot', label: `${session.lane.pivot.label} (one per column)` }] : []),
		{ value: 'ignore', label: "Don't import" }
	]);

	function targetValue(target: ColumnTarget | undefined): string {
		if (!target || target.kind === 'ignore') return 'ignore';
		if (target.kind === 'field') return `field:${target.field}`;
		if (target.kind === 'split') return `split:${target.splitter}`;
		return 'pivot';
	}

	function parseTarget(value: string): ColumnTarget {
		if (value.startsWith('field:')) return { kind: 'field', field: value.slice(6) };
		if (value.startsWith('split:')) return { kind: 'split', splitter: Number(value.slice(6)) };
		if (value === 'pivot') return { kind: 'pivot' };
		return { kind: 'ignore' };
	}

	const usage = $derived.by(() => {
		if (!file || !layout) return { used: 0, total: 0, ignored: [] as string[] };
		const seen: Record<HeaderKey, string> = {};
		layout.sheets.forEach((item, index) => {
			if (!item.included || item.headerRow === null) return;
			for (const cell of file.sheets[index].rows[item.headerRow] ?? [])
				if (cell.trim()) seen[headerKey(cell)] = cell.trim();
		});
		const found = Object.entries(seen) as [HeaderKey, string][];
		const ignored = found.filter(([key]) => targetValue(layout.columns.get(key)) === 'ignore');
		return { used: found.length - ignored.length, total: found.length, ignored: ignored.map(([, label]) => label) };
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
				{includedCount === 1 ? 'One sheet' : `${includedCount} sheets`} read · {plural(session.sourceRows.length, ROWS)}
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
										<NativeSelect.Root
											size="sm"
											class="w-full"
											aria-label="Import {header} as"
											value={targetValue(layout.columns.get(headerKey(header)))}
											onchange={(event) =>
												session.setColumnTarget(headerKey(header), parseTarget(event.currentTarget.value))}
										>
											{#each targetOptions as option (option.value)}
												<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
											{/each}
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
			<p class="min-w-0 flex-1 text-sm text-muted-foreground" role="status">
				{#if session.columnBlockers.length}
					<span class="font-medium text-danger-foreground">{session.columnBlockers[0]}</span>
				{:else}
					{usage.used} of {usage.total} columns used
					{#if usage.ignored.length}· {usage.ignored.join(', ')} not imported{/if}
				{/if}
			</p>
			<Button variant="outline" onclick={onBack}>Back</Button>
			<Button disabled={session.columnBlockers.length > 0} onclick={() => session.goTo('review')}>
				Review {plural(session.sourceRows.length, ROWS)}
				<ArrowRightIcon data-icon="inline-end" />
			</Button>
		</footer>
	</div>
{/if}
