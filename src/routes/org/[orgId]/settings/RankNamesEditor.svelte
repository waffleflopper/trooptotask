<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import {
		RANK_ALREADY_EXISTS_MESSAGE,
		RANK_CODE_REQUIRED_MESSAGE,
		RANK_LABEL_REQUIRED_MESSAGE,
		RANK_TIE_BREAK_MAX,
		RANK_TIE_BREAK_MIN,
		RANK_TIE_BREAK_RANGE_MESSAGE,
		RANK_TIE_BREAK_WHOLE_NUMBER_MESSAGE
	} from '$features/personnel/contracts';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { focusAfterDialogCloses } from '$lib/components/ui/dialog';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { restoreFocus } from '$lib/utils/settleAction';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import { useDataTable, type ColumnDef } from '$lib/components/ui/data-table/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import type { SettingsRankCatalogRow, SettingsRanksSectionData } from './settingsSectionTypes';
	import { RANK_LANE_ORDER, rankInUse, rankSentence } from './ranksCatalog';

	type RankErrorField = 'code' | 'label' | 'sortOrder';
	/** At most one editor is open: the new-rank draft or one rank's row. */
	export type OpenEditor = { kind: 'new' } | { kind: 'rank'; code: string } | null;
	type CatalogRow = { kind: 'new' } | { kind: 'rank'; rank: SettingsRankCatalogRow };

	const RANK_FIELD_ERRORS = new Map<string, RankErrorField>([
		[RANK_CODE_REQUIRED_MESSAGE, 'code'],
		[RANK_ALREADY_EXISTS_MESSAGE, 'code'],
		[RANK_LABEL_REQUIRED_MESSAGE, 'label'],
		[RANK_TIE_BREAK_WHOLE_NUMBER_MESSAGE, 'sortOrder'],
		[RANK_TIE_BREAK_RANGE_MESSAGE, 'sortOrder']
	]);
	const NEW_RANK_KEY = 'rank-add';
	const CONFIRM_FAILURE_FALLBACK = 'Unable to update the rank catalog. Try again.';
	const EDITOR_FIELDS = 'input:not([type=hidden]):not([readonly]), select, button';

	let {
		ranks,
		rows,
		form,
		actionBase,
		openEditor = $bindable(null),
		saving = $bindable(false),
		focusAfterClose
	}: {
		ranks: SettingsRanksSectionData;
		/** The ranks whose names this Organization owns. */
		rows: SettingsRankCatalogRow[];
		form: { [key: string]: unknown; rankError?: string } | null;
		actionBase: string;
		openEditor?: OpenEditor;
		saving?: boolean;
		/** Where focus goes when the new-rank draft closes without a saved rank to land on. */
		focusAfterClose: () => HTMLElement | null;
	} = $props();

	let savingAction = $state<string | null>(null);
	let lastActionKey = $state<string | null>(null);
	let pendingRankDelete = $state<SettingsRankCatalogRow | null>(null);
	let deleteFailed = $state(false);
	let deleteCode = $state('');
	let settleDelete: ((succeeded: boolean) => void) | null = null;

	const rankError = $derived(typeof form?.rankError === 'string' ? form.rankError : null);
	const catalogRows = $derived<CatalogRow[]>([
		...(openEditor?.kind === 'new' ? [{ kind: 'new' } as const] : []),
		...rows.map((rank) => ({ kind: 'rank', rank }) as const)
	]);

	// Errors return from the server without naming the form, so attribute them to the last submitter.
	const rankErrorScope = $derived<'add' | 'edit' | 'global' | null>(
		!rankError ? null : lastActionKey === NEW_RANK_KEY ? 'add' : lastActionKey?.startsWith('edit-') ? 'edit' : 'global'
	);
	const errorEditCode = $derived(
		rankErrorScope === 'edit' && lastActionKey ? lastActionKey.slice('edit-'.length) : null
	);
	const rankErrorField = $derived(rankError ? (RANK_FIELD_ERRORS.get(rankError) ?? null) : null);

	const columns = (
		[
			['rank', 'Rank', undefined],
			['grade', 'Grade', '4.375rem'],
			['inUse', 'In use', '8.125rem']
		] as const
	).map(
		([key, header, width]): ColumnDef<CatalogRow> => ({
			key,
			header,
			width,
			rowHeader: key === 'rank',
			maxWidth: key === 'rank' ? 'none' : undefined,
			value: () => '',
			compare: draftFirst(RANK_LANE_ORDER[key]),
			sortable: true,
			searchable: false
		})
	);

	const catalogTable = useDataTable<CatalogRow>({
		data: () => catalogRows,
		columns,
		initialSortKey: 'rank',
		rowKey: (row) => (row.kind === 'new' ? 'new-rank' : `rank-${row.rank.code}`)
	});

	// The table multiplies a comparator by the sort direction, so the draft's lead flips with it to stay first.
	function draftFirst(compare: (a: SettingsRankCatalogRow, b: SettingsRankCatalogRow) => number) {
		return (a: CatalogRow, b: CatalogRow): number => {
			if (a.kind === 'rank' && b.kind === 'rank') return compare(a.rank, b.rank);
			const draftLead = a.kind === 'new' ? -1 : 1;
			return catalogTable.sortDirection === 'asc' ? draftLead : -draftLead;
		};
	}

	function rankDomId(code: string): string {
		const safeCode = Array.from(code, (char) => char.codePointAt(0)?.toString(36) ?? '0').join('-');
		return `rank-${safeCode || 'entry'}`;
	}

	function rankToggle(code: string): HTMLElement | null {
		return document.getElementById(`${rankDomId(code)}-name`);
	}

	function isEditing(entry: SettingsRankCatalogRow): boolean {
		return openEditor?.kind === 'rank' && openEditor.code === entry.code;
	}

	// A request that settles after the user opened another editor must leave that editor open. SvelteKit's
	// post-action focus reset leaves focus on the body, so it goes back into that editor unless the user moved it.
	async function keepAnotherEditor(editor: NonNullable<OpenEditor>): Promise<boolean> {
		if (openEditor === null) return false;
		const same =
			openEditor.kind === 'new' || editor.kind === 'new'
				? openEditor.kind === editor.kind
				: openEditor.code === editor.code;
		if (same) return false;
		await tick();
		if (document.activeElement === document.body) {
			const id = openEditor.kind === 'new' ? 'new-rank-editor' : `${rankDomId(openEditor.code)}-editor`;
			document.getElementById(id)?.querySelector<HTMLElement>(EDITOR_FIELDS)?.focus();
		}
		return true;
	}

	async function closeEditor(focusCode: string | null = null): Promise<void> {
		const closing = openEditor;
		openEditor = null;
		await tick();
		const code = focusCode ?? (closing?.kind === 'rank' ? closing.code : null);
		restoreFocus([code ? rankToggle(code) : null, focusAfterClose()]);
	}

	const editorFocus: Attachment<HTMLElement> = (node) => {
		node.querySelector<HTMLElement>(EDITOR_FIELDS)?.focus();
		function onkeydown(event: KeyboardEvent) {
			if (event.key !== 'Escape' || event.defaultPrevented) return;
			event.preventDefault();
			void closeEditor();
		}
		node.addEventListener('keydown', onkeydown);
		return () => node.removeEventListener('keydown', onkeydown);
	};

	// Rank mutations run one at a time: savingAction is a single slot, so a second submission would clear it early.
	function enhancedForm(
		key: string | ((data: FormData) => string),
		focusAfter: (succeeded: boolean, code: string | null) => Promise<void>
	): SubmitFunction {
		return ({ cancel, formData }) => {
			if (savingAction !== null) {
				cancel();
				return;
			}
			const actionKey = typeof key === 'string' ? key : key(formData);
			savingAction = actionKey;
			saving = true;
			lastActionKey = actionKey;
			const submittedFrom = location.pathname;
			return async ({ result, update }) => {
				const succeeded = result.type === 'success';
				try {
					await update({ reset: false });
					// SvelteKit applies `form` only on the action's own page, so the page embedding the editor applies it.
					if (actionBase && (succeeded || result.type === 'failure') && location.pathname === submittedFrom) {
						await applyAction(result);
					}
				} finally {
					savingAction = null;
					saving = false;
					settleDelete?.(succeeded);
					settleDelete = null;
				}
				if (succeeded) toastStore.success('Rank catalog updated.');
				await focusAfter(succeeded, succeeded && typeof result.data?.code === 'string' ? result.data.code : null);
			};
		};
	}

	// A new rank's draft closes into its row; a saved rank's editor stays open on Save.
	function saveFocus(editor: NonNullable<OpenEditor>, submitter: () => HTMLElement | null) {
		return async (succeeded: boolean, code: string | null) => {
			if (await keepAnotherEditor(editor)) return;
			if (succeeded && editor.kind === 'new') {
				await closeEditor(code);
				return;
			}
			await tick();
			restoreFocus([submitter(), focusAfterClose()]);
		};
	}

	async function confirmRankDelete() {
		if (!pendingRankDelete || savingAction !== null) return;
		deleteCode = pendingRankDelete.code;
		deleteFailed = false;
		await tick();
		const form = document.getElementById('rank-delete-form');
		if (!(form instanceof HTMLFormElement)) return;
		const succeeded = await new Promise<boolean>((resolve) => {
			settleDelete = resolve;
			form.requestSubmit();
		});
		deleteFailed = !succeeded;
		if (!succeeded) return;
		pendingRankDelete = null;
		openEditor = null;
		focusAfterDialogCloses(() => focusAfterClose());
	}
</script>

{#if rankError && rankErrorScope === 'global' && !deleteFailed}
	<Alert.Root variant="destructive">
		<Alert.Description>{rankError}</Alert.Description>
	</Alert.Root>
{/if}

<form
	id="rank-delete-form"
	method="POST"
	action="{actionBase}?/deleteRank"
	class="hidden"
	use:enhance={enhancedForm(
		(data) => `delete-${data.get('code')}`,
		async () => {}
	)}
>
	<input type="hidden" name="code" value={deleteCode} />
</form>

<DataTable.DataTable
	table={catalogTable}
	variant="editorial"
	stacked
	ariaLabel="Custom rank names"
	emptyMessage="No custom ranks yet."
	stickyHeader={false}
	cell={catalogCell}
	rowDetail={catalogDetail}
	rowDetailVisible={(row) => row.kind === 'new' || isEditing(row.rank)}
/>

{#if pendingRankDelete}
	<ConfirmDialog
		title={`Remove ${pendingRankDelete.code}`}
		message={`${pendingRankDelete.code} ${pendingRankDelete.label} will be permanently removed from the catalog. This cannot be undone.`}
		confirmLabel="Remove rank"
		variant="destructive"
		onConfirm={confirmRankDelete}
		onCancel={() => {
			deleteFailed = false;
			pendingRankDelete = null;
		}}
	>
		{#if deleteFailed}
			<Alert.Root variant="destructive">
				<Alert.Description>{rankError ?? CONFIRM_FAILURE_FALLBACK}</Alert.Description>
			</Alert.Root>
		{/if}
	</ConfirmDialog>
{/if}

{#snippet catalogCell(row: CatalogRow, column: ColumnDef<CatalogRow>)}
	{#if row.kind === 'new'}
		{#if column.key === 'rank'}
			<span class="text-muted-foreground">New custom rank</span>
		{/if}
	{:else}
		{@const entry = row.rank}
		{#if column.key === 'rank'}
			<button
				id={`${rankDomId(entry.code)}-name`}
				type="button"
				class="flex w-full min-w-0 items-baseline gap-3 rounded-sm text-left whitespace-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				aria-expanded={isEditing(entry)}
				aria-controls={isEditing(entry) ? `${rankDomId(entry.code)}-editor` : undefined}
				onclick={() => (openEditor = isEditing(entry) ? null : { kind: 'rank', code: entry.code })}
			>
				<span class="min-w-18 shrink-0 font-mono text-[13px] font-semibold">{entry.code}</span>
				<span class="min-w-0">{entry.label}</span>
			</button>
		{:else if column.key === 'grade'}
			<span class="font-mono text-xs">{entry.payGradeLabel}</span>
		{:else if column.key === 'inUse'}
			{@const inUse = rankInUse(entry.referenceSummary)}
			<span class="font-mono text-xs {inUse.kind === 'people' ? '' : 'text-muted-foreground'}">{inUse.text}</span>
		{/if}
	{/if}
{/snippet}

{#snippet catalogDetail(row: CatalogRow)}
	{@render rankEditor(row.kind === 'new' ? null : row.rank)}
{/snippet}

{#snippet rankEditor(entry: SettingsRankCatalogRow | null)}
	{@const isNew = entry === null}
	{@const key = isNew ? NEW_RANK_KEY : `edit-${entry.code}`}
	{@const domId = isNew ? 'new-rank' : rankDomId(entry.code)}
	{@const fieldError = (field: RankErrorField) =>
		rankError && rankErrorField === field && (isNew ? rankErrorScope === 'add' : errorEditCode === entry.code)
			? rankError
			: null}
	{@const formError =
		rankError &&
		(isNew ? rankErrorScope === 'add' : errorEditCode === entry.code) &&
		(!rankErrorField || (!isNew && rankErrorField === 'code'))
			? rankError
			: null}
	{@const sentence = isNew ? '' : rankSentence(entry)}
	<div id={`${domId}-editor`} class="grid gap-3.5 p-2" {@attach editorFocus}>
		<form
			id={`${domId}-form`}
			method="POST"
			action="{actionBase}?/saveRank"
			aria-label={isNew ? 'New custom rank' : `Edit ${entry.code}`}
			class={[
				'grid gap-3',
				isNew
					? '@2xl/data-table:grid-cols-[8rem_minmax(0,1fr)_8.125rem_7rem_5rem]'
					: '@2xl/data-table:grid-cols-[minmax(0,1fr)_8.125rem_7rem_5rem]'
			]}
			use:enhance={enhancedForm(
				key,
				saveFocus(isNew ? { kind: 'new' } : { kind: 'rank', code: entry.code }, () =>
					document.getElementById(`${domId}-save`)
				)
			)}
		>
			<input type="hidden" name="intent" value={isNew ? 'add' : 'edit'} />
			<input type="hidden" name="service" value={entry?.service ?? 'custom'} />
			<input type="hidden" name="state" value={entry?.state ?? 'active'} />
			{#if isNew}
				<Field.Root data-invalid={fieldError('code') ? true : undefined}>
					<Field.Label for={`${domId}-code`}>Code</Field.Label>
					<Input id={`${domId}-code`} name="code" maxlength={80} placeholder="DET-SGT" required />
					{#if fieldError('code')}<Field.Error>{fieldError('code')}</Field.Error>{/if}
				</Field.Root>
			{:else}
				<input type="hidden" name="code" value={entry.code} />
				<input type="hidden" name="originalCode" value={entry.code} />
			{/if}
			<Field.Root data-invalid={fieldError('label') ? true : undefined}>
				<Field.Label for={`${domId}-label`}>Label</Field.Label>
				<Input
					id={`${domId}-label`}
					name="label"
					value={entry?.label ?? ''}
					maxlength={120}
					placeholder={isNew ? 'Detachment Sergeant' : undefined}
					required
				/>
				{#if fieldError('label')}<Field.Error>{fieldError('label')}</Field.Error>{/if}
			</Field.Root>
			<Field.Root>
				<Field.Label for={`${domId}-category`}>Category</Field.Label>
				<NativeSelect.Root id={`${domId}-category`} name="category" value={entry?.category ?? 'custom'} class="w-full">
					{#each ranks.options.categories as option (option.value)}
						<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Root>
			<Field.Root>
				<Field.Label for={`${domId}-pay-grade`}>Pay grade</Field.Label>
				<NativeSelect.Root
					id={`${domId}-pay-grade`}
					name="payGrade"
					value={entry?.payGrade ?? 'ungraded'}
					class="w-full"
					title={ranks.copy.payGradeHelp}
				>
					{#each ranks.options.payGrades as option (option.value)}
						<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Root>
			<Field.Root data-invalid={fieldError('sortOrder') ? true : undefined}>
				<Field.Label for={`${domId}-sort-order`}>Tie-break</Field.Label>
				<Input
					id={`${domId}-sort-order`}
					name="sortOrder"
					type="number"
					value={entry?.sortOrder ?? 500}
					min={RANK_TIE_BREAK_MIN}
					max={RANK_TIE_BREAK_MAX}
					step="1"
					aria-describedby={`${domId}-tie-break-help`}
				/>
				{#if fieldError('sortOrder')}<Field.Error>{fieldError('sortOrder')}</Field.Error>{/if}
			</Field.Root>
			<Field.Description id={`${domId}-tie-break-help`} class="col-span-full">
				{ranks.copy.tieBreakHelp}
			</Field.Description>
		</form>

		{#if formError}
			<Alert.Root variant="destructive">
				<Alert.Description>{formError}</Alert.Description>
			</Alert.Root>
		{/if}

		<div class="flex flex-col gap-2 @2xl/data-table:flex-row @2xl/data-table:items-center">
			{#if sentence}
				<p class="flex-1 text-sm text-muted-foreground">{sentence}</p>
			{/if}
			<div class="flex flex-wrap items-center justify-end gap-2 @2xl/data-table:ml-auto">
				{#if entry?.commands.canDelete}
					<Button
						type="button"
						variant="destructive"
						size="sm"
						disabled={savingAction !== null}
						onclick={() => (pendingRankDelete = entry)}
					>
						Remove
					</Button>
				{/if}
				<Button type="button" variant="ghost" size="sm" onclick={() => closeEditor()}>Cancel</Button>
				<Button
					id={`${domId}-save`}
					type="submit"
					form={`${domId}-form`}
					size="sm"
					disabled={savingAction !== null}
					aria-busy={savingAction === key}
					aria-label={isNew ? 'Add rank' : `Save ${entry.code}`}
				>
					{isNew ? 'Add rank' : 'Save'}
				</Button>
			</div>
		</div>
	</div>
{/snippet}
