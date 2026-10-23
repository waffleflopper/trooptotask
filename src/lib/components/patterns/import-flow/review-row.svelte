<script lang="ts">
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import Undo2Icon from '@lucide/svelte/icons/undo-2';
	import XIcon from '@lucide/svelte/icons/x';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils.js';
	import type { ReviewedRow } from './rowModel';
	import type { QuestionKey } from './types';
	import {
		cardContext,
		cellText,
		changeFor,
		editableFields,
		fieldMessage,
		looseDiff,
		looseMessages,
		OUTCOMES,
		rowMessages,
		type ReviewColumn
	} from './reviewLayout';
	import CellEditor from './cell-editor.svelte';

	let {
		row,
		columns,
		identityColumns,
		label,
		compact,
		template,
		onEdit,
		onSkip,
		onShowQuestion
	}: {
		row: ReviewedRow<unknown>;
		columns: readonly ReviewColumn[];
		identityColumns: readonly ReviewColumn[];
		label: string;
		compact: boolean;
		template: string;
		onEdit: (field: string, value: string) => void;
		onSkip: (skipped: boolean) => void;
		onShowQuestion: (key: QuestionKey) => void;
	} = $props();

	const source = $derived(row.row);
	const outcome = $derived(OUTCOMES[row.outcome]);
	const allColumns = $derived([...identityColumns, ...columns]);
	const editable = $derived(editableFields(row, allColumns));
	const identityEditors = $derived(identityColumns.filter((column) => editable.has(column.field)));
	const messageId = $derived(`import-row-${source.id}-message`);
	const where = $derived(`${source.sheetName} · row ${source.rowNumber}`);
	const quiet = $derived(row.outcome === 'unchanged' || row.outcome === 'skipped');
	const context = $derived(cardContext(row, columns));
	const unplacedDiff = $derived(looseDiff(row, columns));
	const railQuestion = $derived(row.outcome === 'skipped' ? row.question : undefined);
</script>

{#snippet skipButton()}
	{#if railQuestion}
		<Button
			variant="ghost"
			size={compact ? 'xs' : 'icon-xs'}
			data-skip-control
			aria-label="Change skip for {label} in the fix rail"
			title="Skipped in the fix rail"
			onclick={() => onShowQuestion(railQuestion)}
		>
			<ListChecksIcon data-icon={compact ? 'inline-start' : undefined} />
			{#if compact}Fix rail{/if}
		</Button>
	{:else if row.outcome === 'skipped'}
		<Button
			variant="ghost"
			size={compact ? 'xs' : 'icon-xs'}
			data-skip-control
			aria-label="Undo skip {label}"
			title="Undo skip"
			onclick={() => onSkip(false)}
		>
			<Undo2Icon data-icon={compact ? 'inline-start' : undefined} />
			{#if compact}Undo{/if}
		</Button>
	{:else}
		<Button
			variant="ghost"
			size="icon-xs"
			aria-label="Skip {label}"
			title="Skip this row"
			data-skip-control
			onclick={() => onSkip(true)}
		>
			<XIcon />
		</Button>
	{/if}
{/snippet}

{#snippet editor(column: ReviewColumn, describedBy: string, className?: string)}
	<CellEditor
		value={source.raw[column.field] ?? ''}
		label="{column.label}, {where}"
		{describedBy}
		class={className}
		onCommit={(value) => onEdit(column.field, value)}
	/>
{/snippet}

{#if compact}
	<article
		data-row-id={source.id}
		class="mx-0.5 grid h-[calc(100%-0.75rem)] content-start gap-2 rounded-md border bg-card px-3 py-2"
	>
		<header class="flex min-w-0 items-center gap-2">
			<Badge variant={outcome.badge}>{outcome.label}</Badge>
			<span class={cn('min-w-0 truncate text-sm font-medium', quiet && 'text-muted-foreground')}>{label}</span>
			<span class="ml-auto shrink-0 text-xs text-muted-foreground">{where}</span>
			{@render skipButton()}
		</header>
		{#if (row.outcome === 'fix' || row.outcome === 'update') && context}
			<p class="truncate text-sm text-muted-foreground">{context}</p>
		{/if}
		{#if row.outcome === 'fix'}
			{#each allColumns.filter((column) => editable.has(column.field)) as column (column.field)}
				<div class="grid gap-1">
					<span class="text-xs text-muted-foreground">{column.label}</span>
					{@render editor(column, `${messageId}-${column.field}`)}
					<span id="{messageId}-{column.field}" class="truncate text-xs text-danger-foreground">
						{fieldMessage(row, column.field)}
					</span>
				</div>
			{/each}
			{#each looseMessages(row, editable) as message (message)}
				<p class="truncate text-xs text-danger-foreground">{message}</p>
			{/each}
		{:else if row.outcome === 'update'}
			{#each row.diff as change (change.label)}
				<p class="flex min-w-0 items-baseline gap-2 text-sm">
					<span class="w-24 shrink-0 text-xs text-muted-foreground">{change.label}</span>
					{#if change.after}<span class="truncate font-medium">{change.after}</span>{/if}
					<span class="truncate text-xs text-muted-foreground line-through" title={change.before || undefined}
						>{change.before || 'was empty'}</span
					>
				</p>
			{/each}
		{:else}
			<p class="truncate text-sm text-muted-foreground">
				{row.outcome === 'skipped' ? row.reason : context}
			</p>
		{/if}
	</article>
{:else}
	<div class="h-full border-b text-sm" role="row" data-row-id={source.id}>
		<div class="grid h-[51px] items-center gap-x-2 px-3" style:grid-template-columns={template}>
			<div
				class="sticky left-0 z-[1] -mr-2 -ml-3 grid h-full min-w-0 content-center gap-0.5 bg-background pr-2 pl-3"
				role="rowheader"
				aria-label="{label}, {outcome.label}, {where}"
			>
				{#if identityEditors.length}
					<span class="flex min-w-0 gap-1">
						{#each identityColumns as column (column.field)}
							{#if editable.has(column.field)}
								{@render editor(column, messageId, 'min-w-0 border-destructive')}
							{:else}
								<span class="min-w-0 truncate self-center font-medium">{source.raw[column.field]}</span>
							{/if}
						{/each}
					</span>
				{:else}
					<span class={cn('truncate font-medium', quiet && 'text-muted-foreground')} title={label}>{label}</span>
				{/if}
				<span class="flex min-w-0 items-center gap-1.5">
					<Badge variant={outcome.badge}>{outcome.label}</Badge>
					<span class="truncate text-xs text-muted-foreground">{where}</span>
				</span>
			</div>
			{#each columns as column (column.field)}
				{@const change = changeFor(row, column)}
				<div class="min-w-0" role="cell">
					{#if editable.has(column.field)}
						{@render editor(column, messageId, 'border-destructive')}
					{:else if change}
						<span class="block truncate font-medium" title={change.after}>{change.after}</span>
						<span class="block truncate text-xs text-muted-foreground line-through">{change.before || 'was empty'}</span
						>
					{:else}
						{@const value = cellText(row, column)}
						<span class={cn('block truncate', quiet && 'text-muted-foreground')} title={value || undefined}
							>{value}</span
						>
					{/if}
				</div>
			{/each}
			<div class="flex justify-end" role="cell">{@render skipButton()}</div>
		</div>
		{#if row.outcome === 'fix'}
			{@const messages = rowMessages(row).join(' ')}
			<p id={messageId} class="-mt-1 truncate px-3 pb-2 text-xs text-danger-foreground" title={messages}>
				{messages}
			</p>
		{:else if unplacedDiff.length}
			<p class="-mt-1 flex min-w-0 gap-3 px-3 pb-2 text-xs">
				{#each unplacedDiff as change (change.label)}
					<span class="flex min-w-0 gap-1.5">
						<span class="shrink-0 text-muted-foreground">{change.label}</span>
						{#if change.after}<span class="truncate font-medium">{change.after}</span>{/if}
						{#if change.before}
							<span class="truncate text-muted-foreground line-through" title={change.before}>{change.before}</span>
						{/if}
					</span>
				{/each}
			</p>
		{/if}
	</div>
{/if}
