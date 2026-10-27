<script lang="ts">
	import { enhance } from '$app/forms';
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
	import SearchIcon from '@lucide/svelte/icons/search';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import { useDataTable, type ColumnDef, type DataTableRowAction } from '$lib/components/ui/data-table/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import type { RanksSettingsData } from './settingsSectionTypes';
	import type { SettingsRankCatalogRow, SettingsRankServicePackOption } from './settingsSectionTypes';
	import {
		filterRanks,
		RANK_LANE_ORDER,
		rankInUse,
		rankSentence,
		type RankBranchFilter,
		type RankStateFilter
	} from './ranksCatalog';

	type RankErrorField = 'code' | 'label' | 'sortOrder';
	type BulkRankTargetState = 'active' | 'retired';
	type PendingBulkRankState = {
		pack: SettingsRankServicePackOption;
		targetState: BulkRankTargetState;
	};
	/** At most one editor is open: the new-rank draft or one rank's row. */
	type OpenEditor = { kind: 'new' } | { kind: 'rank'; code: string } | null;
	type CatalogRow = { kind: 'new' } | { kind: 'rank'; rank: SettingsRankCatalogRow };
	type RowFormIntent = 'retire' | 'reactivate' | 'delete';

	const RANK_FIELD_ERRORS = new Map<string, RankErrorField>([
		[RANK_CODE_REQUIRED_MESSAGE, 'code'],
		[RANK_ALREADY_EXISTS_MESSAGE, 'code'],
		[RANK_LABEL_REQUIRED_MESSAGE, 'label'],
		[RANK_TIE_BREAK_WHOLE_NUMBER_MESSAGE, 'sortOrder'],
		[RANK_TIE_BREAK_RANGE_MESSAGE, 'sortOrder']
	]);
	const ROW_ACTION_KEYS = ['edit', 'retire', 'reactivate', 'delete'];
	const ROW_FORM_ACTIONS: Record<RowFormIntent, string> = {
		retire: '?/retireRank',
		reactivate: '?/reactivateRank',
		delete: '?/deleteRank'
	};
	const NEW_RANK_KEY = 'rank-add';
	const CONFIRM_FAILURE_FALLBACK = 'Unable to update the rank catalog. Try again.';
	const STATE_FILTER_OPTIONS: Array<{ value: RankStateFilter; label: string }> = [
		{ value: 'all', label: 'All' },
		{ value: 'active', label: 'Active' },
		{ value: 'retired', label: 'Retired' }
	];

	let {
		ranksSettings,
		form,
		actionBase = ''
	}: {
		ranksSettings: RanksSettingsData;
		form: { [key: string]: unknown; rankError?: string } | null;
		/** The Settings › Ranks path, when the editor is shown on another page. Its actions live there. */
		actionBase?: string;
	} = $props();

	let savingAction = $state<string | null>(null);
	let settleSubmission: ((succeeded: boolean) => void) | null = null;
	let confirmFailed = $state(false);
	let lastActionKey = $state<string | null>(null);
	let stateFilter = $state<RankStateFilter>('all');
	let branchFilter = $state<RankBranchFilter>('all');
	let search = $state('');
	let openEditor = $state<OpenEditor>(null);
	let rowFormCode = $state('');
	const EDITOR_FIELDS = 'input:not([type=hidden]):not([readonly]), select, button';
	let addCustomRankButton = $state<HTMLElement | null>(null);
	let pendingBulkRankState = $state<PendingBulkRankState | null>(null);
	let pendingRankRetire = $state<SettingsRankCatalogRow | null>(null);
	let pendingRankDelete = $state<SettingsRankCatalogRow | null>(null);

	const ranks = $derived(ranksSettings.sections.ranks);
	const canManage = $derived(ranks.commands.canManageCatalog);
	const rankError = $derived(typeof form?.rankError === 'string' ? form.rankError : null);
	const branchFilterOptions = $derived([{ value: 'all' as const, label: 'All branches' }, ...ranks.options.services]);

	const allRanks = $derived([...ranks.entries.active, ...ranks.entries.retired]);
	const customCount = $derived(allRanks.filter((entry) => entry.source === 'custom').length);
	const visibleRanks = $derived(filterRanks(allRanks, { state: stateFilter, branch: branchFilter, search }));
	const visibleCodes = $derived(new Set(visibleRanks.map((rank) => rank.code)));
	const catalogRows = $derived<CatalogRow[]>([
		...(openEditor?.kind === 'new' ? [{ kind: 'new' } as const] : []),
		...allRanks.map((rank) => ({ kind: 'rank', rank }) as const)
	]);

	// Errors and successes return from the server without naming the form, so attribute them to the last submitter.
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
			['branch', 'Branch', '6.875rem'],
			['grade', 'Grade', '4.375rem'],
			['source', 'Source', '6.25rem'],
			['inUse', 'In use', '8.125rem'],
			['state', 'State', '5rem'],
			['actions', '', '3rem']
		] as const
	).map(
		([key, header, width]): ColumnDef<CatalogRow> => ({
			key,
			header,
			width,
			headerAriaLabel: key === 'actions' ? 'Row actions' : undefined,
			rowHeader: key === 'rank',
			maxWidth: key === 'rank' ? 'none' : undefined,
			value: () => '',
			compare: key === 'actions' ? undefined : draftFirst(RANK_LANE_ORDER[key]),
			sortable: key !== 'actions',
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

	const emptyFilterMessage = $derived(
		`No ${stateFilter === 'all' ? '' : `${stateFilter} `}ranks match ${
			branchFilter === 'all'
				? 'all branches'
				: (ranks.options.services.find((option) => option.value === branchFilter)?.label ?? branchFilter)
		}${search.trim() ? ` and "${search.trim()}"` : ''}.`
	);

	function rankDomId(code: string): string {
		const safeCode = Array.from(code, (char) => char.codePointAt(0)?.toString(36) ?? '0').join('-');
		return `rank-${safeCode || 'entry'}`;
	}

	function rankToggle(code: string): HTMLElement | null {
		return document.getElementById(`${rankDomId(code)}-toggle`);
	}

	function isRowSaving(entry: SettingsRankCatalogRow): boolean {
		return ROW_ACTION_KEYS.some((key) => savingAction === `${key}-${entry.code}`);
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

	function toggleRank(entry: SettingsRankCatalogRow): void {
		openEditor = isEditing(entry) ? null : { kind: 'rank', code: entry.code };
	}

	function openNewRank(): void {
		openEditor = { kind: 'new' };
	}

	async function closeEditor(focusCode: string | null = null): Promise<void> {
		const closing = openEditor;
		openEditor = null;
		await tick();
		const code = focusCode ?? (closing?.kind === 'rank' ? closing.code : null);
		restoreFocus([
			code ? rankToggle(code) : null,
			addCustomRankButton,
			document.getElementById('rank-catalog-heading')
		]);
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
	// SvelteKit moves focus to the body after a success, so focus goes back to the submitter or the row it changed.
	function enhancedForm(
		key: string | ((data: FormData) => string),
		{
			focusAfter,
			focusFallback
		}: {
			focusAfter?: (succeeded: boolean, code: string | null) => Promise<void>;
			focusFallback?: () => HTMLElement | null;
		} = {}
	): SubmitFunction {
		return ({ cancel, submitter, formData }) => {
			if (savingAction !== null) {
				cancel();
				return;
			}
			const actionKey = typeof key === 'string' ? key : key(formData);
			savingAction = actionKey;
			lastActionKey = actionKey;
			return async ({ result, update }) => {
				const succeeded = result.type === 'success';
				try {
					await update({ reset: false });
				} finally {
					savingAction = null;
					settleSubmission?.(succeeded);
					settleSubmission = null;
				}
				if (succeeded) toastStore.success('Rank catalog updated.');
				const savedCode = succeeded && typeof result.data?.code === 'string' ? result.data.code : null;
				if (focusAfter) {
					await focusAfter(succeeded, savedCode);
					return;
				}
				if (!submitter) return;
				await tick();
				restoreFocus([submitter, focusFallback?.()]);
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
			restoreFocus([submitter(), document.getElementById('rank-catalog-heading')]);
		};
	}

	function submitFormById(id: string): boolean {
		const element = document.getElementById(id);
		if (!(element instanceof HTMLFormElement)) return false;
		element.requestSubmit();
		return true;
	}

	async function submitRowForm(intent: RowFormIntent, code: string): Promise<boolean> {
		if (savingAction !== null) return false;
		rowFormCode = code;
		await tick();
		return submitFormAndWait(`rank-${intent}-form`);
	}

	// Resolves with whether the form's request succeeded, once its enhance callback has applied the result.
	function submitFormAndWait(id: string): Promise<boolean> {
		if (savingAction !== null) return Promise.resolve(false);
		return new Promise((resolve) => {
			settleSubmission = resolve;
			if (!submitFormById(id)) resolve(false);
		});
	}

	function rankToggles(): HTMLElement[] {
		return [...document.querySelectorAll<HTMLElement>('tr:not([hidden]) [data-rank-toggle]')];
	}

	// The row itself if it survived, else the row that took its place, else the one before it, else the heading.
	function rankRowFocusTarget(code: string): () => HTMLElement | null {
		const id = `${rankDomId(code)}-toggle`;
		const index = rankToggles().findIndex((toggle) => toggle.id === id);
		return () => {
			const toggles = rankToggles();
			return (
				toggles.find((toggle) => toggle.id === id) ??
				toggles[index] ??
				toggles[index - 1] ??
				document.getElementById('rank-catalog-heading')
			);
		};
	}

	function packActionsFocusTarget(pack: SettingsRankServicePackOption): () => HTMLElement | null {
		const label = `More actions for ${pack.label}`;
		return () =>
			[...document.querySelectorAll<HTMLElement>('button')].find(
				(button) => button.getAttribute('aria-label') === label
			) ?? document.getElementById('rank-branch-coverage-heading');
	}

	// Keeps the confirmation open until the request settles. A failure leaves it open so it can be retried or cancelled.
	async function confirmWithForm(
		submit: () => Promise<boolean>,
		close: () => void,
		focusTarget: () => HTMLElement | null
	) {
		confirmFailed = false;
		const succeeded = await submit();
		confirmFailed = !succeeded;
		if (!succeeded) return;
		close();
		openEditor = null;
		focusAfterDialogCloses(focusTarget);
	}

	function cancelConfirmation(clear: () => void) {
		confirmFailed = false;
		clear();
	}

	async function reactivate(entry: SettingsRankCatalogRow) {
		if (savingAction !== null) return;
		const focusTarget = rankRowFocusTarget(entry.code);
		const succeeded = await submitRowForm('reactivate', entry.code);
		if (await keepAnotherEditor({ kind: 'rank', code: entry.code })) return;
		if (succeeded) openEditor = null;
		await tick();
		restoreFocus([focusTarget()]);
	}

	function rankRowActions(entry: SettingsRankCatalogRow): DataTableRowAction<CatalogRow>[] {
		const actions: DataTableRowAction<CatalogRow>[] = [];
		if (entry.commands.canEdit) {
			actions.push({ label: 'Edit', onSelect: () => (openEditor = { kind: 'rank', code: entry.code }) });
		}
		if (entry.commands.canRetire) {
			actions.push({ label: 'Retire', disabled: savingAction !== null, onSelect: () => (pendingRankRetire = entry) });
		}
		if (entry.commands.canReactivate) {
			actions.push({ label: 'Reactivate', disabled: savingAction !== null, onSelect: () => reactivate(entry) });
		}
		if (entry.commands.canDelete) {
			actions.push({
				label: 'Remove',
				destructive: true,
				disabled: savingAction !== null,
				onSelect: () => (pendingRankDelete = entry)
			});
		}
		return actions;
	}

	function packActions(pack: SettingsRankServicePackOption): DataTableRowAction<SettingsRankServicePackOption>[] {
		const actions: DataTableRowAction<SettingsRankServicePackOption>[] = [];
		if (pack.canBulkRetire) {
			actions.push({
				label: `Retire active ranks (${pack.activeCount})`,
				disabled: savingAction !== null,
				onSelect: () => (pendingBulkRankState = { pack, targetState: 'retired' })
			});
		}
		if (pack.canBulkReactivate) {
			actions.push({
				label: `Reactivate retired ranks (${pack.retiredCount})`,
				disabled: savingAction !== null,
				onSelect: () => (pendingBulkRankState = { pack, targetState: 'active' })
			});
		}
		return actions;
	}

	function packCountText(pack: SettingsRankServicePackOption): string {
		if (pack.existingCount === 0) return 'Not added';
		if (pack.retiredCount === 0) return `${pack.activeCount} active`;
		return `${pack.activeCount} · ${pack.retiredCount} retired`;
	}

	function packShare(count: number, pack: SettingsRankServicePackOption): string {
		return `${(count / pack.builtInCount) * 100}%`;
	}

	async function confirmBulkRankState() {
		if (!pendingBulkRankState) return;
		const { pack, targetState } = pendingBulkRankState;
		await confirmWithForm(
			() => submitFormAndWait(`bulk-${targetState}-${pack.value}`),
			() => (pendingBulkRankState = null),
			packActionsFocusTarget(pack)
		);
	}

	async function confirmRankRetire() {
		if (!pendingRankRetire) return;
		const code = pendingRankRetire.code;
		await confirmWithForm(
			() => submitRowForm('retire', code),
			() => (pendingRankRetire = null),
			rankRowFocusTarget(code)
		);
	}

	async function confirmRankDelete() {
		if (!pendingRankDelete) return;
		const code = pendingRankDelete.code;
		await confirmWithForm(
			() => submitRowForm('delete', code),
			() => (pendingRankDelete = null),
			rankRowFocusTarget(code)
		);
	}

	function bulkRankStateTitle(pending: PendingBulkRankState): string {
		return pending.targetState === 'retired'
			? `Retire ${pending.pack.label} ranks`
			: `Reactivate ${pending.pack.label} ranks`;
	}

	function bulkRankStateMessage(pending: PendingBulkRankState): string {
		if (pending.targetState === 'retired') {
			return `${pending.pack.activeCount} ${pending.pack.label} built-in ranks will be hidden from future rank selection. Existing Personnel records and historical references stay intact.`;
		}
		return `${pending.pack.retiredCount} ${pending.pack.label} built-in ranks will become available for future rank selection again. Existing records stay intact.`;
	}

	function bulkRankStateConfirmLabel(pending: PendingBulkRankState): string {
		return pending.targetState === 'retired' ? 'Retire active ranks' : 'Reactivate retired ranks';
	}
</script>

<div class="grid gap-10">
	{#if rankError && rankErrorScope === 'global' && !confirmFailed}
		<Alert.Root variant="destructive">
			<Alert.Description>{rankError}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if !canManage}
		<Alert.Root>
			<Alert.Description>
				Organization admin or owner access is required to change branch packs, custom ranks, or retirement state.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<section aria-labelledby="rank-branch-coverage-heading">
		<PageShell.SectionHeader
			id="rank-branch-coverage-heading"
			tabindex={-1}
			title="Branch coverage"
			detail="Built-in rank packs"
			size="compact"
			ruled
		>
			{#snippet action()}
				<ul class="flex flex-wrap items-center gap-4 font-mono text-xs text-muted-foreground" aria-label="Legend">
					<li class="flex items-center gap-1.5">
						<span class="h-1.5 w-2.5 rounded-full bg-foreground" aria-hidden="true"></span>Active
					</li>
					<li class="flex items-center gap-1.5">
						<span class="h-1.5 w-2.5 rounded-full bg-muted-foreground" aria-hidden="true"></span>Retired
					</li>
					<li class="flex items-center gap-1.5">
						<span class="h-1.5 w-2.5 rounded-full bg-input" aria-hidden="true"></span>Missing
					</li>
				</ul>
			{/snippet}
		</PageShell.SectionHeader>

		<ul class="@container">
			{#each ranks.servicePacks as pack (pack.value)}
				{@const added = pack.existingCount > 0}
				<li
					class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b py-2.5 @xl:grid-cols-[8.75rem_minmax(0,1fr)_9.375rem_5.625rem_7.5rem] @xl:py-1.5"
				>
					<h3 class="text-sm {added ? 'font-semibold' : 'text-muted-foreground'}">{pack.label}</h3>
					<div
						class="col-span-2 row-start-2 flex h-1.5 overflow-hidden rounded-full bg-input @xl:col-span-1 @xl:row-start-auto"
						role="img"
						aria-label={`${pack.label}: ${pack.activeCount} active, ${pack.retiredCount} retired, ${pack.missingCount} missing of ${pack.builtInCount} built-in ranks`}
					>
						<div class="bg-foreground" style:width={packShare(pack.activeCount, pack)}></div>
						<div class="bg-muted-foreground" style:width={packShare(pack.retiredCount, pack)}></div>
					</div>
					<p class="row-start-3 font-mono text-xs text-muted-foreground @xl:row-start-auto">{packCountText(pack)}</p>
					<p
						class="row-start-3 font-mono text-xs @xl:row-start-auto {added && pack.missingCount > 0
							? 'font-semibold text-warning-foreground'
							: 'text-muted-foreground'}"
					>
						{#if !added}
							{pack.builtInCount} ranks
						{:else if pack.missingCount > 0}
							{pack.missingCount} missing
						{/if}
					</p>
					<div
						class="col-start-2 row-start-1 flex items-center justify-end gap-1 @xl:col-start-auto @xl:row-start-auto"
					>
						{#if pack.missingCount > 0}
							<form
								method="POST"
								action="{actionBase}?/addServicePack"
								use:enhance={enhancedForm(`pack-${pack.value}`, { focusFallback: packActionsFocusTarget(pack) })}
							>
								<input type="hidden" name="service" value={pack.value} />
								<Button
									type="submit"
									variant="outline"
									size="sm"
									disabled={!ranks.commands.canAddServicePack || savingAction !== null}
									aria-busy={savingAction === `pack-${pack.value}`}
									aria-label={`Add ${pack.missingCount} ${pack.label} ranks`}
								>
									Add {pack.missingCount}
								</Button>
							</form>
						{/if}
						{#if pack.canBulkRetire || pack.canBulkReactivate}
							<form
								id={`bulk-retired-${pack.value}`}
								method="POST"
								action="{actionBase}?/bulkRankState"
								class="hidden"
								use:enhance={enhancedForm(`bulk-retire-${pack.value}`)}
							>
								<input type="hidden" name="service" value={pack.value} />
								<input type="hidden" name="targetState" value="retired" />
							</form>
							<form
								id={`bulk-active-${pack.value}`}
								method="POST"
								action="{actionBase}?/bulkRankState"
								class="hidden"
								use:enhance={enhancedForm(`bulk-reactivate-${pack.value}`)}
							>
								<input type="hidden" name="service" value={pack.value} />
								<input type="hidden" name="targetState" value="active" />
							</form>
							<DataTable.RowActions
								row={pack}
								actions={packActions(pack)}
								ariaLabel={`More actions for ${pack.label}`}
							/>
						{:else}
							<span class="size-8" aria-hidden="true"></span>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<section aria-labelledby="rank-catalog-heading">
		<PageShell.SectionHeader
			id="rank-catalog-heading"
			tabindex={-1}
			title="Catalog"
			detail={`${ranks.entries.active.length} active · ${ranks.entries.retired.length} retired · ${customCount} custom`}
			size="compact"
			ruled
		>
			{#snippet action()}
				{#if ranks.commands.canAddCustomRank}
					<Button
						bind:ref={addCustomRankButton}
						type="button"
						size="sm"
						disabled={openEditor?.kind === 'new'}
						onclick={openNewRank}
					>
						Add custom rank
					</Button>
				{/if}
			{/snippet}
		</PageShell.SectionHeader>

		{#if allRanks.length === 0 && openEditor?.kind !== 'new'}
			<Empty.Root>
				<Empty.Header>
					<Empty.Title level={3}>No ranks in this catalog yet.</Empty.Title>
					<Empty.Description>Add a branch pack from Branch coverage above, or add a custom rank.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<div class="flex flex-wrap items-center gap-2 py-3" role="group" aria-label="Rank filters">
				<SegmentedFilter.Root options={STATE_FILTER_OPTIONS} bind:value={stateFilter} label="Filter ranks by state" />
				<NativeSelect.Root bind:value={branchFilter} aria-label="Filter ranks by branch">
					{#each branchFilterOptions as option (option.value)}
						<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
				<div class="min-w-48 flex-1 md:ml-auto md:max-w-60">
					<InputGroup.Root>
						<InputGroup.Addon>
							<SearchIcon aria-hidden="true" />
						</InputGroup.Addon>
						<InputGroup.Input type="search" bind:value={search} placeholder="Search ranks" aria-label="Search ranks" />
					</InputGroup.Root>
				</div>
			</div>
			<p class="sr-only" role="status">{visibleRanks.length} of {allRanks.length} ranks shown</p>

			{#if canManage}
				{#each Object.entries(ROW_FORM_ACTIONS) as [intent, action] (intent)}
					<form
						id={`rank-${intent}-form`}
						method="POST"
						action="{actionBase}{action}"
						class="hidden"
						use:enhance={enhancedForm((data) => `${intent}-${data.get('code')}`)}
					>
						<input type="hidden" name="code" value={rowFormCode} />
					</form>
				{/each}
			{/if}

			<DataTable.DataTable
				table={catalogTable}
				variant="editorial"
				stacked
				ariaLabel="Organization ranks"
				emptyMessage={emptyFilterMessage}
				stickyHeader={false}
				cell={catalogCell}
				rowDetail={catalogDetail}
				rowDetailVisible={(row) => row.kind === 'new' || isEditing(row.rank)}
				rowHidden={(row) => row.kind === 'rank' && !visibleCodes.has(row.rank.code)}
			/>
		{/if}
	</section>
</div>

{#if pendingBulkRankState}
	<ConfirmDialog
		title={bulkRankStateTitle(pendingBulkRankState)}
		message={bulkRankStateMessage(pendingBulkRankState)}
		confirmLabel={bulkRankStateConfirmLabel(pendingBulkRankState)}
		variant="default"
		onConfirm={confirmBulkRankState}
		onCancel={() => cancelConfirmation(() => (pendingBulkRankState = null))}
	>
		{@render confirmFailure()}
	</ConfirmDialog>
{/if}

{#if pendingRankRetire}
	<ConfirmDialog
		title={`Retire ${pendingRankRetire.code}`}
		message={`${pendingRankRetire.code} ${pendingRankRetire.label} will be hidden from future rank selection. Existing Personnel records and historical references stay intact.`}
		confirmLabel="Retire rank"
		variant="default"
		onConfirm={confirmRankRetire}
		onCancel={() => cancelConfirmation(() => (pendingRankRetire = null))}
	>
		{@render confirmFailure()}
	</ConfirmDialog>
{/if}

{#if pendingRankDelete}
	<ConfirmDialog
		title={`Remove ${pendingRankDelete.code}`}
		message={`${pendingRankDelete.code} ${pendingRankDelete.label} will be permanently removed from the catalog. This cannot be undone.`}
		confirmLabel="Remove rank"
		variant="destructive"
		onConfirm={confirmRankDelete}
		onCancel={() => cancelConfirmation(() => (pendingRankDelete = null))}
	>
		{@render confirmFailure()}
	</ConfirmDialog>
{/if}

{#snippet confirmFailure()}
	{#if confirmFailed}
		<Alert.Root variant="destructive">
			<Alert.Description>{rankError ?? CONFIRM_FAILURE_FALLBACK}</Alert.Description>
		</Alert.Root>
	{/if}
{/snippet}

{#snippet catalogCell(row: CatalogRow, column: ColumnDef<CatalogRow>)}
	{#if row.kind === 'new'}
		{#if column.key === 'rank'}
			<span class="text-muted-foreground">New custom rank</span>
		{/if}
	{:else}
		{@const entry = row.rank}
		{@const retired = entry.state === 'retired'}
		{@const inUse = rankInUse(entry.referenceSummary)}
		{#if column.key === 'rank'}
			<button
				id={`${rankDomId(entry.code)}-toggle`}
				type="button"
				data-rank-toggle
				class="flex w-full min-w-0 items-baseline gap-3 rounded-sm text-left whitespace-normal outline-none focus-visible:ring-3 focus-visible:ring-ring/50 {retired
					? 'text-muted-foreground'
					: ''}"
				aria-expanded={isEditing(entry)}
				aria-controls={isEditing(entry) ? `${rankDomId(entry.code)}-editor` : undefined}
				onclick={() => toggleRank(entry)}
			>
				<span class="min-w-18 shrink-0 font-mono text-[13px] font-semibold">{entry.code}</span>
				<span class="min-w-0">{entry.label}</span>
			</button>
		{:else if column.key === 'branch'}
			<span class="font-mono text-xs text-muted-foreground">{entry.serviceLabel}</span>
		{:else if column.key === 'grade'}
			<span class="font-mono text-xs {retired ? 'text-muted-foreground' : ''}">{entry.payGradeLabel}</span>
		{:else if column.key === 'source'}
			<span class="font-mono text-xs text-muted-foreground">{entry.sourceLabel}</span>
		{:else if column.key === 'inUse'}
			<span class="font-mono text-xs {inUse.kind === 'people' ? '' : 'text-muted-foreground'}">{inUse.text}</span>
		{:else if column.key === 'state'}
			<span
				class="font-mono text-[11px] font-medium tracking-[0.08em] uppercase {retired ? 'text-muted-foreground' : ''}"
			>
				{retired ? 'Retired' : 'Active'}
			</span>
		{:else if column.key === 'actions'}
			{@const actions = rankRowActions(entry)}
			<div class="flex justify-end">
				{#if actions.length > 0}
					<DataTable.RowActions {row} {actions} ariaLabel={`Actions for ${entry.code}`} busy={isRowSaving(entry)} />
				{/if}
			</div>
		{/if}
	{/if}
{/snippet}

{#snippet catalogDetail(row: CatalogRow)}
	{#if row.kind === 'new'}
		{@render rankEditor(null)}
	{:else}
		{@render rankEditor(row.rank)}
	{/if}
{/snippet}

{#snippet rankEditor(entry: SettingsRankCatalogRow | null)}
	{@const isNew = entry === null}
	{@const key = isNew ? NEW_RANK_KEY : `edit-${entry.code}`}
	{@const domId = isNew ? 'new-rank' : rankDomId(entry.code)}
	{@const editable = isNew || entry.commands.canEdit}
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
		{#if editable}
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
				use:enhance={enhancedForm(key, {
					focusAfter: saveFocus(isNew ? { kind: 'new' } : { kind: 'rank', code: entry.code }, () =>
						document.getElementById(`${domId}-save`)
					)
				})}
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
					<NativeSelect.Root
						id={`${domId}-category`}
						name="category"
						value={entry?.category ?? 'custom'}
						class="w-full"
					>
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
		{/if}

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
				{#if entry?.commands.canRetire}
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={savingAction !== null}
						onclick={() => (pendingRankRetire = entry)}
					>
						Retire
					</Button>
				{/if}
				{#if entry?.commands.canReactivate}
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={savingAction !== null}
						aria-busy={savingAction === `reactivate-${entry.code}`}
						onclick={() => reactivate(entry)}
					>
						Reactivate
					</Button>
				{/if}
				<Button type="button" variant="ghost" size="sm" onclick={() => closeEditor()}>
					{editable ? 'Cancel' : 'Close'}
				</Button>
				{#if editable}
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
				{/if}
			</div>
		</div>
	</div>
{/snippet}
