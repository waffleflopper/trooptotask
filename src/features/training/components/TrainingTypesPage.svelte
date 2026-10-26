<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ChevronLeft, Plus } from '@lucide/svelte';
	import type { TrainingPageAccess } from '../contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as Empty from '$lib/components/ui/empty';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { ReorderGrip, ReorderItem, ReorderList } from '$lib/components/patterns/reorder-list';
	import type { Personnel, RankCatalogEntry } from '$features/personnel/contracts';
	import { createRosterReadModel } from '$features/personnel/contracts';
	import { rosterStore } from '$features/personnel';
	import { trainingRankCatalogStore } from '$features/training/stores/rankCatalog.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatToday } from '$lib/utils/dates';
	import { isTrainingApplicable } from '$features/training/utils/applicability';
	import { summarizeApplicability } from '$features/training/utils/trainingApplicabilitySummary';
	import { trainingTypeDraftFrom } from '$features/training/utils/trainingTypeDraft';
	import type { TrainingType } from '$features/training/training.types';
	import TrainingTypeSheet from './TrainingTypeSheet.svelte';

	let {
		data,
		org,
		orgName = '',
		loading = false
	}: {
		data: {
			[key: string]: unknown;
			training?: { data?: Partial<import('../contracts').TrainingWorkspaceData> };
			personnel?: Personnel[];
		};
		org: TrainingPageAccess;
		orgName?: string;
		/** The types or personnel are still on their way. */
		loading?: boolean;
	} = $props();

	const canMutate = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.configureRequirements, { kind: 'organization' })
			.allowed
	);
	const workspaceData = $derived(data.training?.data);
	const matrixHref = $derived(resolve(`/org/${org.orgUrlSegment ?? org.orgId}/training`));

	/** The edited type is kept as it was opened, so a delete that removes it from the store does not unmount the sheet early. */
	type Sheet = { type: TrainingType | null };
	let sheet = $state.raw<Sheet | null>(null);
	let focusAfterClose: () => HTMLElement | null | undefined = () => undefined;
	let reordering = $state(false);
	let pendingOrder = $state<string[] | null>(null);
	let newTypeButton = $state<HTMLElement | null>(null);
	let list = $state<HTMLDivElement | null>(null);
	const today = formatToday();
	const GRID =
		'grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 @4xl:grid-cols-[2rem_minmax(12rem,2.2fr)_10rem_6.5rem_minmax(9rem,1.6fr)_6.5rem_5.5rem] @4xl:items-center';

	const orderedTypes = $derived([...trainingTypesStore.items].sort((a, b) => a.sortOrder - b.sortOrder));
	const rows = $derived(
		pendingOrder ? pendingOrder.flatMap((id) => orderedTypes.find((type) => type.id === id) ?? []) : orderedTypes
	);

	const fallbackPersonnel = $derived(
		Array.isArray(workspaceData?.personnel)
			? workspaceData.personnel
			: Array.isArray(data.personnel)
				? data.personnel
				: []
	);
	const personnel = $derived(
		rosterStore.orgId === org.orgId
			? rosterStore.readModel().full({ status: 'active' }).flatPersonnel
			: createRosterReadModel({ personnel: fallbackPersonnel, groups: [], pinnedGroups: [] }).full({ status: 'active' })
					.flatPersonnel
	);
	const rankCatalog = $derived(
		Array.isArray(workspaceData?.rankCatalog)
			? (workspaceData.rankCatalog as RankCatalogEntry[])
			: trainingRankCatalogStore.orgId === org.orgId
				? (trainingRankCatalogStore.items as RankCatalogEntry[])
				: undefined
	);

	function renews(type: TrainingType): string {
		const renewal = trainingTypeDraftFrom(type).renewal;
		if (renewal.kind === 'cardDate') return 'Date on the card';
		if (renewal.kind === 'never') return 'Never expires';
		return renewal.months === 1 ? 'Every month' : `Every ${renewal.months} months`;
	}

	const warnsAt = (type: TrainingType) =>
		trainingTypeDraftFrom(type).renewal.kind === 'never'
			? '—'
			: `${type.warningDaysYellow}d · ${type.warningDaysOrange}d`;

	const rowButton = (id: string) => list?.querySelector<HTMLElement>(`[data-type-id="${CSS.escape(id)}"]`);

	function openSheet(next: Sheet, opener: HTMLElement | null) {
		if (!canMutate || sheet) return;
		focusAfterClose = () => (opener?.isConnected ? opener : newTypeButton);
		sheet = next;
	}

	function closeSheet(focusTypeId?: string) {
		const opener = focusAfterClose;
		focusAfterClose = () => (focusTypeId ? rowButton(focusTypeId) : null) ?? opener() ?? newTypeButton;
		sheet = null;
	}

	function returnFocus() {
		focusAfterClose()?.focus();
	}

	function openRow(event: MouseEvent, type: TrainingType) {
		const target = event.target as HTMLElement;
		if (target.closest('[data-reorder-grip]')) return;
		openSheet({ type }, rowButton(type.id) ?? null);
	}

	async function move(id: string, toIndex: number) {
		if (reordering) return;
		const next = rows.filter((type) => type.id !== id);
		const moved = rows.find((type) => type.id === id);
		if (!moved) return;
		next.splice(toIndex, 0, moved);
		const positions = orderedTypes.map((type) => type.sortOrder).sort((a, b) => a - b);
		// Distinct positions are handed to the rows in their new order, so a refused write can disturb only the rows
		// that moved. Shared positions are renumbered so the move takes effect and the tie is repaired.
		const distinct = new Set(positions).size === positions.length;
		const changed = next
			.map((type, index) => ({ type, sortOrder: distinct ? positions[index] : index }))
			.filter(({ type, sortOrder }) => type.sortOrder !== sortOrder);
		if (changed.length === 0) return;
		reordering = true;
		pendingOrder = next.map((type) => type.id);
		try {
			const saved = await Promise.all(
				changed.map(({ type, sortOrder }) =>
					trainingTypesStore.updateOrThrow(type.id, { sortOrder }).then(Boolean, () => false)
				)
			);
			if (saved.every(Boolean)) return;
			toastStore.error('Failed to save the training type order. Reloading the saved order.');
			await invalidate('app:training-data');
		} finally {
			pendingOrder = null;
			reordering = false;
		}
	}
</script>

{#snippet cellLabel(text: string)}
	<span class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase sr-only @max-4xl:not-sr-only"
		>{text}</span
	>
{/snippet}

<div class="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
	<div class="flex min-h-full flex-1 flex-col gap-6 px-6 pt-4 pb-5 max-sm:p-3">
		<PageShell.Header
			eyebrow={orgName ? `Training · ${orgName}` : 'Training'}
			title="Training types"
			variant="display"
			subtitle={loading
				? 'The order here is the column order in the matrix and on reports.'
				: `${orderedTypes.length} ${orderedTypes.length === 1 ? 'type' : 'types'}. The order here is the column order in the matrix and on reports.`}
		>
			{#snippet aside()}
				<Button variant="outline" href={matrixHref}><ChevronLeft aria-hidden="true" />Back to matrix</Button>
				{#if canMutate}
					<Button
						bind:ref={newTypeButton}
						disabled={loading}
						onclick={(event) => openSheet({ type: null }, event.currentTarget)}
					>
						<Plus aria-hidden="true" />New type
					</Button>
				{/if}
			{/snippet}
		</PageShell.Header>

		<section aria-label="Training types" class="@container grid gap-3">
			{#if loading}
				<div class="overflow-hidden rounded-lg border bg-card" role="status" aria-label="Loading training types">
					{#each { length: 6 }, index (index)}
						<div class="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
							<Skeleton class="size-3 rounded-sm" />
							<div class="grid flex-1 gap-1.5">
								<Skeleton class="h-4 w-40" />
								<Skeleton class="h-3.5 w-64 max-w-full" />
							</div>
							<Skeleton class="hidden h-4 w-28 @4xl:block" />
							<Skeleton class="hidden h-4 w-16 @4xl:block" />
						</div>
					{/each}
				</div>
			{:else if orderedTypes.length === 0}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title level={3}>No training types yet.</Empty.Title>
						<Empty.Description>Create one to get started.</Empty.Description>
					</Empty.Header>
					{#if canMutate}
						<Empty.Content>
							<Button type="button" onclick={(event) => openSheet({ type: null }, event.currentTarget)}>
								<Plus aria-hidden="true" />New type
							</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else}
				{#snippet rowCells(type: TrainingType)}
					<div class="flex min-w-0 items-start gap-3">
						<span class="mt-1.5 size-3 shrink-0 rounded-sm" style="background-color: {type.color}" aria-hidden="true"
						></span>
						<div class="grid min-w-0">
							{#if canMutate}
								<button
									type="button"
									data-type-id={type.id}
									class="w-fit max-w-full cursor-pointer text-start font-heading text-base font-semibold wrap-anywhere outline-none focus-visible:underline"
								>
									{type.name}
								</button>
							{:else}
								<span class="font-heading text-base font-semibold wrap-anywhere">{type.name}</span>
							{/if}
							{#if type.description}
								<span class="text-sm text-muted-foreground wrap-anywhere">{type.description}</span>
							{/if}
						</div>
					</div>
					<div class="col-start-2 grid gap-1.5 text-sm @4xl:contents">
						<span class="flex flex-wrap gap-x-2">{@render cellLabel('Renews')}{renews(type)}</span>
						<span class="flex flex-wrap gap-x-2 font-mono text-[13px]">
							{@render cellLabel('Warns at')}{warnsAt(type)}
						</span>
						<span class="flex flex-wrap gap-x-2">
							{@render cellLabel('Who needs it')}{summarizeApplicability(trainingTypeDraftFrom(type).applicability)}
						</span>
					</div>
					<div class="col-start-2 flex flex-wrap gap-x-6 gap-y-1 text-sm @4xl:contents">
						<span class="flex gap-x-2 font-mono text-[13px] @4xl:justify-end">
							{@render cellLabel('Applies to')}{personnel.filter((person) => isTrainingApplicable(type, person)).length} of
							{personnel.length}
						</span>
						<span class="flex gap-x-2 font-mono text-[13px] @4xl:justify-end">
							{@render cellLabel('Exempt')}{type.canBeExempted ? 'Allowed' : '—'}
						</span>
					</div>
				{/snippet}

				<div class="overflow-hidden rounded-lg border bg-card">
					<div
						class="{GRID} border-b-2 border-foreground bg-muted/40 px-3 py-2.5 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase @max-4xl:hidden"
						aria-hidden="true"
					>
						<span></span>
						<span>Training</span>
						<span>Renews</span>
						<span>Warns at</span>
						<span>Who needs it</span>
						<span class="text-end">Applies to</span>
						<span class="text-end">Exempt</span>
					</div>
					{#if canMutate}
						<ReorderList
							bind:ref={list}
							aria-label="Training types, in column order"
							entries={rows.map((type) => ({ id: type.id, label: type.name }))}
							onmove={move}
						>
							{#each rows as type (type.id)}
								<ReorderItem
									id={type.id}
									class="{GRID} cursor-pointer border-b px-3 py-3 last:border-b-0 hover:bg-muted/40"
									onclick={(event) => openRow(event, type)}
								>
									<ReorderGrip class="mt-0.5" />
									{@render rowCells(type)}
								</ReorderItem>
							{/each}
						</ReorderList>
					{:else}
						<div role="list" bind:this={list} aria-label="Training types, in column order">
							{#each rows as type (type.id)}
								<div role="listitem" class="{GRID} border-b px-3 py-3 last:border-b-0">
									<span></span>
									{@render rowCells(type)}
								</div>
							{/each}
						</div>
					{/if}
				</div>
				{#if canMutate}
					<p class="text-sm text-muted-foreground">
						Drag a row by its handle, or use Alt + ↑ ↓, to change the column order. Click a row to edit it.
					</p>
				{/if}
			{/if}
		</section>
	</div>
</div>

{#if sheet}
	{@const opened = sheet.type}
	<TrainingTypeSheet
		{org}
		type={opened}
		position={opened ? orderedTypes.findIndex((type) => type.id === opened.id) + 1 : 0}
		catalogSize={orderedTypes.length}
		nextSortOrder={orderedTypes.reduce((next, type) => Math.max(next, type.sortOrder + 1), 0)}
		{personnel}
		{rankCatalog}
		{today}
		onSaved={closeSheet}
		onDeleted={() => closeSheet()}
		onClose={() => closeSheet()}
		{returnFocus}
	/>
{/if}
