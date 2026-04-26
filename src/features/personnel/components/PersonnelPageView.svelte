<script lang="ts">
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import FloatingPageToolbar from '$lib/components/FloatingPageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import {
		ToolbarActions,
		ToolbarMetaItem,
		ToolbarSearchItem,
		ToolbarViewToggle,
		type ToolbarActionConfig
	} from '$lib/components/ui/toolbar';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { UpcomingLossRecord } from '$features/dashboard/utils/evaluateUpcomingLosses';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import { useDataTable } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type { Personnel } from '$lib/types';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		ctx: PersonnelPageContext;
		permissions: import('$lib/types').OrganizationMemberPermissions | null | undefined;
	}

	let { ctx, permissions }: Props = $props();

	const ROSTER_PAGE_SIZE = 75;
	const GROUPED_ROSTER_RENDER_LIMIT = 250;
	const rosterViewOptions = [
		{ value: 'alphabetical', label: 'A-Z' },
		{ value: 'by-group', label: 'Group' }
	];

	const awardTrackingOverrides = new SvelteMap<string, boolean>();
	const savingAwardTrackingByPersonId = new SvelteMap<string, boolean>();
	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);
	const canViewRoster = $derived(permissions?.canViewPersonnel ?? false);
	const canEditRoster = $derived(permissions?.canEditPersonnel ?? false);
	const upcomingLossMap = $derived(ctx.upcomingLossMap);
	const canManageRoster = $derived(ctx.canAddPersonnel);

	const personnelActionItems = $derived.by<ToolbarActionConfig[]>(() => {
		const items: ToolbarActionConfig[] = [];
		if (canManageRoster) {
			items.push({
				id: 'bulk-import',
				label: 'Import',
				onclick: () => ctx.openBulkManager(),
				icon: 'upload',
				disabled: readOnly,
				priority: 'low'
			});
			items.push({
				id: 'manage-groups',
				label: 'Manage Groups',
				onclick: () => ctx.openGroupManager(),
				icon: 'book-open',
				disabled: readOnly,
				variant: 'secondary'
			});
			items.push({
				id: 'add-person',
				label: 'Add Person',
				onclick: () => ctx.handleAdd(),
				icon: 'clipboard-check',
				disabled: readOnly,
				priority: 'critical',
				overflow: 'never',
				variant: 'primary'
			});
		}
		return items;
	});

	// Personnel DataTable setup
	const personnelColumns = $derived.by<ColumnDef<Personnel>[]>(() => {
		const columns: ColumnDef<Personnel>[] = [
			{ key: 'rank', header: 'Rank', value: (p) => p.rank },
			{
				key: 'name',
				header: 'Name',
				value: (p) => `${p.lastName}, ${p.firstName}`,
				compare: (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
			},
			{ key: 'mos', header: 'MOS', value: (p) => p.mos },
			{ key: 'role', header: 'Duty Role', value: (p) => p.clinicRole },
			{ key: 'group', header: 'Group', value: (p) => p.groupName }
		];

		if (permissions?.canEditPersonnel) {
			columns.push({
				key: 'actions',
				header: 'Actions',
				value: () => '',
				searchable: false,
				sortable: false
			});
		}

		return columns;
	});

	const azTable = useDataTable<Personnel>({
		data: () => personnelStore.items,
		columns: () => personnelColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		pageSize: ROSTER_PAGE_SIZE
	});

	const groupedTable = useDataTable<Personnel>({
		data: () => personnelStore.items,
		columns: () => personnelColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		groupBy: {
			key: (p) => p.groupName || 'Unassigned',
			compare: (a, b) => {
				const aPin = pinnedGroupsStore.list.includes(a) ? 0 : 1;
				const bPin = pinnedGroupsStore.list.includes(b) ? 0 : 1;
				if (aPin !== bPin) return aPin - bPin;
				return a.localeCompare(b);
			}
		}
	});

	let rosterSearch = $state('');
	const shouldGateGroupedRoster = $derived(
		ctx.viewMode === 'by-group' && !rosterSearch.trim() && groupedTable.totalRows > GROUPED_ROSTER_RENDER_LIMIT
	);

	$effect(() => {
		azTable.setSearch(rosterSearch);
		groupedTable.setSearch(rosterSearch);
	});

	const handleRowClick = $derived(canEditRoster ? (person: Personnel) => ctx.handleEdit(person) : undefined);

	function getPersonnelRowActionLabel(person: Personnel): string {
		return `Edit ${person.rank} ${person.lastName}, ${person.firstName}`;
	}

	function isAwardTrackingAcknowledged(personId: string, lossRecord: UpcomingLossRecord): boolean {
		return awardTrackingOverrides.has(personId)
			? Boolean(awardTrackingOverrides.get(personId))
			: lossRecord.awardTrackingAcknowledged;
	}

	function getAwardTrackingActionLabel(acknowledged: boolean): string {
		return acknowledged ? 'Clear ack' : 'Ack award';
	}

	async function setAwardTrackingAcknowledged(personId: string, acknowledged: boolean) {
		if (savingAwardTrackingByPersonId.get(personId) === true) return;

		savingAwardTrackingByPersonId.set(personId, true);
		try {
			const response = await fetch(`/org/${ctx.orgId}/api/personnel/${personId}/award-tracking`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ acknowledged })
			});
			if (!response.ok) {
				throw new Error(`Failed to update award acknowledgement for ${personId}`);
			}

			awardTrackingOverrides.set(personId, acknowledged);
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to update award acknowledgement');
		} finally {
			savingAwardTrackingByPersonId.delete(personId);
		}
	}
</script>

<svelte:head>
	<title>Personnel - Troop to Task</title>
</svelte:head>

<div class="page">
	{#if !canViewRoster}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content roster-content">
			<FloatingPageToolbar ariaLabel="Personnel controls" leadingMin="0" collapse="narrow">
				{#snippet leading()}
					<div class="roster-controls" aria-label="Roster filters">
						<ToolbarViewToggle
							ariaLabel="Roster sort mode"
							options={rosterViewOptions}
							value={ctx.viewMode}
							mode="full"
							onValueChange={(value) => (ctx.viewMode = value as 'alphabetical' | 'by-group')}
						/>
						<ToolbarSearchItem
							testId="personnel-search"
							ariaLabel="Search by name, rank, MOS, role, or group"
							placeholder="Search name, rank, MOS, role, or group..."
							width="wide"
							bind:value={rosterSearch}
						/>
					</div>
				{/snippet}

				{#if personnelActionItems.length > 0}
					<ToolbarActions
						actions={personnelActionItems}
						ariaLabel="Personnel actions"
						overflowAriaLabel="More personnel actions"
						overflowIconOnly
					/>
					{#if readOnly}
						<ToolbarMetaItem label="Upgrade to edit" tone="warning" />
					{/if}
				{/if}
			</FloatingPageToolbar>

			{#if ctx.totalPersonnel === 0}
				<EmptyState
					message="No personnel on the active roster. Add one person, or use the actions menu for Bulk Import when you have a roster file."
					actionLabel={canEditRoster ? 'Add Person' : undefined}
					onAction={canEditRoster ? () => ctx.handleAdd() : undefined}
				/>
			{:else if shouldGateGroupedRoster}
				<div class="roster-scale-guard">
					<div>
						<span class="scale-kicker">Grouped roster paused</span>
						<p>
							{groupedTable.totalRows} personnel are loaded. Search within the roster or switch to the paged A-Z view to keep
							this page fast.
						</p>
					</div>
					<div class="scale-actions">
						<input
							type="search"
							class="input scale-search"
							aria-label="Search by name, rank, MOS, role, or group"
							placeholder="Search roster..."
							bind:value={rosterSearch}
						/>
						<button class="btn btn-primary btn-sm" type="button" onclick={() => (ctx.viewMode = 'alphabetical')}>
							Use A-Z View
						</button>
					</div>
				</div>
			{:else}
				<div class="roster-table-region">
					<DataTable
						table={ctx.viewMode === 'alphabetical' ? azTable : groupedTable}
						columns={personnelColumns}
						onRowClick={handleRowClick}
						rowActionLabel={canEditRoster ? getPersonnelRowActionLabel : undefined}
						ariaLabel="Personnel roster"
						emptyMessage="No personnel match your search."
						maxHeight="100%"
					>
						{#snippet cell(row, col)}
							{@const lossRecord = upcomingLossMap.get(row.id)}
							{#if col.key === 'rank'}
								<span class="cell-rank">{row.rank}</span>
							{:else if col.key === 'name'}
								<span class="cell-name-group">
									<span class="cell-name">{row.lastName}, {row.firstName}</span>
									{#if lossRecord}
										<span
											class="loss-chip"
											class:loss-chip--ets={lossRecord.triggerType === 'ETS'}
											data-testid="loss-indicator-{row.id}"
											title="{lossRecord.triggerType} in {lossRecord.daysRemaining} day{lossRecord.daysRemaining === 1
												? ''
												: 's'}">{lossRecord.triggerType === 'ETS' ? 'ETS' : 'PCS'}</span
										>
									{/if}
								</span>
							{:else if col.key === 'actions'}
								<div class="row-actions">
									{#if lossRecord}
										{@const awardTrackingAcknowledged = isAwardTrackingAcknowledged(row.id, lossRecord)}
										<button
											class="btn btn-sm btn-secondary"
											type="button"
											title={awardTrackingAcknowledged
												? 'Remove the award acknowledgement'
												: 'Acknowledge that the award requirement is being tracked'}
											disabled={readOnly || savingAwardTrackingByPersonId.get(row.id) === true}
											data-testid="award-ack-action-{row.id}"
											onclick={(e) => {
												e.stopPropagation();
												void setAwardTrackingAcknowledged(row.id, !awardTrackingAcknowledged);
											}}
										>
											{getAwardTrackingActionLabel(awardTrackingAcknowledged)}
										</button>
									{/if}
									<button
										class="btn btn-sm btn-secondary"
										type="button"
										onclick={(e) => {
											e.stopPropagation();
											ctx.handleEdit(row);
										}}
									>
										Edit
									</button>
								</div>
							{:else}
								{String(col.value(row) ?? '')}
							{/if}
						{/snippet}
						{#snippet groupHeader(group)}
							<div class="dt-group-header">
								<button class="dt-group-toggle" type="button" onclick={group.toggle}>
									<span class="dt-toggle-icon">{group.collapsed ? '▶' : '▼'}</span>
									<span class="dt-group-label">{group.label}</span>
									<span class="dt-group-count">{group.count}</span>
								</button>
								<button
									class="dt-pin-btn"
									type="button"
									class:pinned={pinnedGroupsStore.list.includes(group.key)}
									onclick={() => pinnedGroupsStore.toggle(group.key)}
									title={pinnedGroupsStore.list.includes(group.key) ? 'Unpin group' : 'Pin group to top'}
								>
									{pinnedGroupsStore.list.includes(group.key) ? 'Pinned' : 'Pin'}
								</button>
							</div>
						{/snippet}
					</DataTable>
				</div>
			{/if}
		</main>
	{/if}
</div>

<style>
	.page {
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--surface-page);
	}

	.page-content.roster-content {
		display: flex;
		min-height: 0;
		flex-direction: column;
		gap: var(--sp-4);
		overflow: hidden;
		padding: var(--sp-4) var(--sp-6) var(--sp-5);
	}

	.roster-controls {
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: var(--sp-2);
		min-width: 0;
	}

	.roster-controls {
		justify-content: flex-start;
	}

	.roster-table-region {
		display: flex;
		flex: 1 1 auto;
		min-height: 0;
	}

	.roster-table-region :global(.data-table) {
		width: 100%;
		flex: 1 1 auto;
		min-height: 0;
	}

	.roster-scale-guard {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-5);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.roster-scale-guard p {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
		line-height: var(--line-height-copy);
		max-width: 68ch;
	}

	.scale-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex: 0 1 420px;
		min-width: min(100%, 300px);
	}

	.scale-search {
		min-width: 0;
	}

	.scale-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.no-permission {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 320px;
		margin: var(--sp-6);
		padding: var(--sp-8);
		text-align: center;
		color: var(--text-secondary);
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
	}

	.no-permission h2 {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 1.2rem + 0.8vw, 2.1rem);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.no-permission p {
		margin: 0;
		max-width: 44ch;
		line-height: var(--line-height-copy);
	}

	.cell-rank {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.cell-name {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	/* ── Loss indicator chip ─────────────────────────────────────────────────
	   Lightweight row-level signal for personnel approaching ETS or PCS/DEROS.
	   Mirrors the trigger-chip styling in UpcomingLossesWidget for consistency;
	   kept intentionally small so the roster remains readable at a glance.
	──────────────────────────────────────────────────────────────────────── */
	.cell-name-group {
		display: inline-flex;
		align-items: baseline;
		gap: var(--sp-2);
		min-width: 0;
	}

	.row-actions {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.loss-chip {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		padding: 1px 5px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
		line-height: 1.4;
		/* PCS / DEROS default: neutral tint — matches UpcomingLossesWidget */
		background: var(--ink-06);
		color: var(--text-secondary);
	}

	/* ETS: amber-tinted to flag impending separation */
	.loss-chip--ets {
		background: color-mix(in srgb, var(--amber-light) 80%, var(--surface-panel) 20%);
		color: var(--amber-dark);
	}

	.dt-group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		width: 100%;
	}

	.dt-group-toggle {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 9px 0;
		background: transparent;
		border: none;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
		text-align: left;
	}

	.dt-toggle-icon {
		font-size: 10px;
		width: 12px;
		color: var(--amber-dark);
	}

	.dt-group-label {
		color: var(--text-primary);
	}

	.dt-group-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 22px;
		min-height: 22px;
		padding: 3px 6px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-secondary);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
	}

	.dt-pin-btn {
		appearance: none;
		min-height: 32px;
		padding: 0 10px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.dt-pin-btn:hover {
		background: var(--surface-subtle);
		border-color: var(--ink-35);
		color: var(--text-primary);
	}

	.dt-pin-btn.pinned {
		border-color: var(--amber);
		background: var(--amber-light);
		color: var(--amber-dark);
	}

	@media (max-width: 640px) {
		.page-content.roster-content {
			padding: var(--sp-3);
		}

		.roster-controls {
			flex-wrap: wrap;
			justify-content: flex-start;
		}

		.roster-scale-guard {
			flex-direction: column;
			align-items: stretch;
		}

		.scale-actions {
			flex-direction: column;
			align-items: stretch;
			flex-basis: auto;
		}

		.dt-pin-btn {
			min-height: 44px;
		}
	}

	@media (min-width: 641px) and (max-width: 1024px) {
		.roster-controls {
			justify-content: flex-start;
		}
	}
</style>
