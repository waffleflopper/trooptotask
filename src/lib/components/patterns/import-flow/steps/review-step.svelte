<script lang="ts">
	import { tick } from 'svelte';
	import SearchIcon from '@lucide/svelte/icons/search';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Progress } from '$lib/components/ui/progress';
	import { VirtualList } from '$lib/components/ui/virtual-list';
	import type { ReviewFilter } from '../importSession.svelte';
	import type { QuestionKey } from '../types';
	import type { ReviewedRow } from '../rowModel';
	import { cardRowHeight, OUTCOMES, tableRowHeight, type ReviewColumn } from '../reviewLayout';
	import { plural, type FlowSession } from '../flowTypes';
	import FixRail from '../fix-rail.svelte';
	import ReviewRow from '../review-row.svelte';

	let { session, onBack }: { session: FlowSession; onBack: () => void } = $props();

	const COMPACT_BELOW = 640;
	const ROWS = { one: 'row', other: 'rows' };
	const CHANGES = { one: 'change', other: 'changes' };

	let width = $state(0);
	let root = $state<HTMLElement | null>(null);
	let listArea = $state<HTMLElement | null>(null);
	let commitButton = $state<HTMLButtonElement | null>(null);
	let query = $state('');

	const review = $derived(session.review);
	const counts = $derived(review.counts);
	const compact = $derived(width > 0 && width < COMPACT_BELOW);
	const committing = $derived(session.phase.step === 'committing' ? session.phase.progress : null);

	const identityFields = $derived(new Set<string>(session.lane.identity?.fields ?? []));
	const shownFields = $derived.by(() => {
		const shown = new Set<string>();
		for (const row of session.sourceRows) for (const field in row.raw) shown.add(field);
		for (const edit of session.edits.values()) for (const field in edit) shown.add(field);
		for (const row of review.rows)
			if (row.outcome === 'fix') for (const problem of row.problems) shown.add(problem.field);
		return Object.keys(session.lane.columns)
			.filter((field) => shown.has(field) && !identityFields.has(field))
			.join('\n');
	});
	const toColumn = (field: string): ReviewColumn => ({
		field,
		label: session.lane.columns[field].label,
		kind: session.lane.columns[field].kind
	});
	const columns = $derived(shownFields ? shownFields.split('\n').map(toColumn) : []);
	const identityColumns = $derived([...identityFields].map(toColumn));
	const identityHeader = $derived(session.lane.identity ? session.lane.noun.one : 'Row');

	const IDENTITY_REM = 9.5;
	const SKIP_REM = 2;
	const GAP_REM = 0.5;
	const PADDING_REM = 1.5;
	const minRem = (column: ReviewColumn) => (column.kind === 'date' ? 5.5 : 3.5);
	const template = $derived(
		[
			`minmax(${IDENTITY_REM}rem, 2.5fr)`,
			...columns.map((column) => `minmax(${minRem(column)}rem, 1fr)`),
			`${SKIP_REM}rem`
		].join(' ')
	);
	const minWidth = $derived(
		`${IDENTITY_REM + columns.reduce((sum, column) => sum + minRem(column), 0) + SKIP_REM + (columns.length + 1) * GAP_REM + PADDING_REM}rem`
	);

	const filterOptions = $derived(
		[
			{ value: 'all' as const, label: 'All', count: review.rows.length },
			...(['fix', 'new', 'update', 'unchanged', 'skipped'] as const).map((outcome) => ({
				value: outcome,
				label: OUTCOMES[outcome].label,
				count: counts[outcome]
			}))
		].filter((option) => option.value === 'all' || option.count > 0 || option.value === session.filter)
	);

	const rows = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		const filter = session.filter;
		return review.rows.filter((row) => {
			if (filter === 'all' ? row.outcome === 'unchanged' : row.outcome !== filter) return false;
			if (!needle) return true;
			return Object.values(row.row.raw).some((value) => value.toLowerCase().includes(needle));
		});
	});

	function label(row: ReviewedRow<unknown>): string {
		return session.lane.identity?.label(row.row.raw) || `Row ${row.row.rowNumber}`;
	}

	function showQuestion(key: QuestionKey) {
		const card = root?.querySelector<HTMLElement>(`[data-question-key="${CSS.escape(key)}"]`);
		card?.scrollIntoView({ block: 'nearest' });
		card?.focus();
	}

	const PROBLEM_CELL = 'input[aria-invalid="true"]';
	const SKIP_CONTROL = '[data-skip-control]';

	function stops(selector: string): HTMLElement[] {
		return [...(listArea?.querySelectorAll<HTMLElement>(selector) ?? [])];
	}

	function focusLost(): boolean {
		return !document.activeElement || document.activeElement === document.body;
	}

	function focusNextStop() {
		const target =
			root?.querySelector<HTMLElement>('[data-rail-open]') ??
			stops(PROBLEM_CELL)[0] ??
			(commitButton && !commitButton.disabled ? commitButton : null);
		target?.focus();
	}

	async function refocusIfDropped(selector: string, rowId: string, change: () => void) {
		const before = stops(selector);
		const from = before.indexOf(document.activeElement as HTMLElement);
		change();
		await tick();
		if (from < 0 || !focusLost()) return;
		const sameRow =
			selector === SKIP_CONTROL
				? listArea?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(rowId)}"] ${SKIP_CONTROL}`)
				: null;
		const next = sameRow ?? before.slice(from + 1).find((stop) => stop.isConnected) ?? stops(selector)[0];
		if (next) next.focus();
		else focusNextStop();
	}

	async function create(key: QuestionKey, name: string) {
		const result = await session.createOption(key, name);
		await tick();
		if (focusLost()) focusNextStop();
		return result;
	}

	function setFilter(value: ReviewFilter) {
		session.filter = value;
	}
</script>

<div class="grid min-w-0 gap-4" bind:this={root}>
	<div class="flex flex-wrap items-center gap-3">
		<SegmentedFilter.Root label="Show rows" options={filterOptions} bind:value={() => session.filter, setFilter} />
		<div class="relative ml-auto w-full sm:w-56">
			<SearchIcon class="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
			<Input
				bind:value={query}
				type="search"
				placeholder="Find a {session.lane.noun.one}"
				aria-label="Find a {session.lane.noun.one}"
				class="pl-8"
			/>
		</div>
	</div>

	<div class="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
		<div class="min-w-0 lg:order-2">
			<FixRail {session} onCreate={create} />
		</div>
		<div class="grid min-w-0 gap-2 lg:order-1" bind:clientWidth={width} bind:this={listArea}>
			<VirtualList
				items={rows}
				key={(row) => row.row.id}
				height={(row) => (compact ? cardRowHeight(row, identityColumns, columns) : tableRowHeight(row))}
				class="max-h-[calc(100dvh-18rem)] min-h-48 rounded-md border"
				contentClass={compact ? 'pt-2' : undefined}
				style={compact ? undefined : `--import-min-width: ${minWidth}`}
				role={compact ? undefined : 'table'}
				aria-label="Rows to import"
				aria-rowcount={compact ? undefined : rows.length}
			>
				{#snippet header()}
					{#if !compact}
						<div
							role="row"
							class="grid h-9 min-w-(--import-min-width) items-center gap-x-2 border-b bg-muted px-3 font-mono text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase"
							style:grid-template-columns={template}
						>
							<span role="columnheader" class="sticky left-0 z-10 -mr-2 -ml-3 h-full content-center bg-muted pr-2 pl-3"
								>{identityHeader}</span
							>
							{#each columns as column (column.field)}
								<span role="columnheader" class="truncate">{column.label}</span>
							{/each}
							<span role="columnheader" class="sr-only">Skip</span>
						</div>
					{/if}
				{/snippet}
				{#snippet item(row)}
					<div class={compact ? 'h-full' : 'h-full min-w-(--import-min-width)'}>
						<ReviewRow
							{row}
							{columns}
							{identityColumns}
							{compact}
							{template}
							label={label(row)}
							onEdit={(field, value) =>
								void refocusIfDropped(PROBLEM_CELL, row.row.id, () => session.editCell(row.row.id, field, value))}
							onSkip={(skipped) =>
								void refocusIfDropped(SKIP_CONTROL, row.row.id, () => session.setRowSkipped(row.row.id, skipped))}
							onShowQuestion={showQuestion}
						/>
					</div>
				{/snippet}
			</VirtualList>
			{#if rows.length === 0}
				<p class="px-1 text-sm text-muted-foreground" role="status">No rows here.</p>
			{/if}
			{#if session.filter === 'all' && counts.unchanged > 0}
				<p class="flex flex-wrap items-center gap-x-2 px-1 text-sm text-muted-foreground">
					{plural(counts.unchanged, ROWS)} already {counts.unchanged === 1 ? 'matches' : 'match'}. Nothing to save.
					<Button variant="link" size="none" onclick={() => setFilter('unchanged')}>Show</Button>
				</p>
			{/if}
		</div>
	</div>

	<div
		class="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-chrome px-4 py-3 text-chrome-text"
	>
		{#if committing}
			<div class="grid min-w-0 flex-1 basis-48 gap-1.5" role="status">
				<span class="text-sm font-medium">
					Saving {committing.sent.toLocaleString()} of {plural(committing.total, CHANGES)}
				</span>
				<Progress value={committing.sent} max={Math.max(1, committing.total)} class="bg-chrome-surface" />
			</div>
		{:else}
			<div class="grid min-w-0 flex-1 basis-48 gap-0.5">
				<span class="text-sm font-semibold">{plural(review.changeCount, CHANGES)} ready</span>
				<span id="import-commit-detail" class="truncate text-xs text-chrome-text-muted">
					{counts.new.toLocaleString()} added · {counts.update.toLocaleString()} updated{counts.fix
						? ` · ${plural(counts.fix, ROWS)} ${counts.fix === 1 ? 'waits' : 'wait'} for a fix`
						: ''}
				</span>
			</div>
			<Button variant="ghost" class="text-chrome-text hover:bg-chrome-hover hover:text-chrome-text" onclick={onBack}>
				Back to columns
			</Button>
		{/if}
		<Button
			bind:ref={commitButton}
			variant="accent"
			disabled={!!session.commitBlocker || session.creating.size > 0 || !!committing}
			aria-describedby="import-commit-detail"
			title={session.commitBlocker ?? undefined}
			onclick={() => void session.commit()}
		>
			Import {plural(review.changeCount, CHANGES)}
		</Button>
	</div>
</div>
