<script lang="ts">
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { OverflowItem } from '$lib/components/ui/OverflowMenu.types';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { UpcomingLossRecord } from '$features/dashboard/utils/evaluateUpcomingLosses';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import { useDataTable } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type { Personnel } from '$lib/types';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	interface Props {
		ctx: PersonnelPageContext;
		permissions: import('$lib/types').OrganizationMemberPermissions | null | undefined;
	}

	let { ctx, permissions }: Props = $props();

	const ROSTER_PAGE_SIZE = 75;
	const GROUPED_ROSTER_RENDER_LIMIT = 250;

	const awardTrackingOverrides = new SvelteMap<string, boolean>();
	const savingAwardTrackingByPersonId = new SvelteMap<string, boolean>();
	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);
	const canViewRoster = $derived(permissions?.canViewPersonnel ?? false);
	const canEditRoster = $derived(permissions?.canEditPersonnel ?? false);

	const rosterGroupCount = $derived.by(() => {
		const groupNames = new SvelteSet<string>();
		for (const person of personnelStore.items) {
			const groupName = person.groupName?.trim();
			if (groupName) groupNames.add(groupName);
		}
		return groupNames.size;
	});

	const unassignedCount = $derived(
		personnelStore.items.filter((person) => !person.groupName || person.groupName.trim() === '').length
	);
	const upcomingLossMap = $derived(ctx.upcomingLossMap);
	const pageScopeLabel = $derived(ctx.data.scopedGroupId ? 'Scoped group roster' : 'Organization roster');
	const rosterAccessLabel = $derived(readOnly ? 'Read only' : canEditRoster ? 'Editable' : 'View only');
	const rosterSubtitle = $derived(`${pageScopeLabel} · ${rosterAccessLabel}`);
	const rosterOperationalSummary = $derived.by(() => [
		{ label: 'Roster', value: `${personnelStore.items.length} total` },
		{ label: 'Groups', value: `${rosterGroupCount} active` },
		{ label: 'Unassigned', value: String(unassignedCount), alert: unassignedCount > 0 },
		{ label: 'Access', value: rosterAccessLabel }
	]);
	const canManageRoster = $derived(ctx.canAddPersonnel);

	const personnelOverflowItems = $derived.by<OverflowItem[]>(() => {
		const items: OverflowItem[] = [];
		if (canManageRoster) {
			items.push({ label: 'Add Person', onclick: () => ctx.handleAdd(), disabled: readOnly });
			items.push({ label: 'Manage Groups', onclick: () => ctx.openGroupManager(), disabled: readOnly });
			items.push({
				label: 'Bulk Import',
				onclick: () => ctx.openBulkManager(),
				divider: true,
				disabled: readOnly
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
	<PageToolbar title="Personnel" subtitle={rosterSubtitle} helpTopic="personnel" overflowItems={personnelOverflowItems}>
		{#if canManageRoster}
			<button class="btn-ghost" type="button" onclick={() => ctx.openGroupManager()} disabled={readOnly}>
				Manage Groups
			</button>
			<button
				class="btn btn-sm btn-primary"
				type="button"
				data-testid="add-personnel-btn"
				onclick={() => ctx.handleAdd()}
				disabled={readOnly}
			>
				Add Person
			</button>
			{#if readOnly}
				<span class="text-muted" style="font-size: var(--text-xs);">Upgrade to edit</span>
			{/if}
		{/if}

		{#snippet below()}
			<div class="operational-strip" aria-label="Personnel operational summary">
				{#each rosterOperationalSummary as item (item.label)}
					<div class="operational-item" class:alert={item.alert}>
						<span class="operational-label">{item.label}</span>
						<span class="operational-value">{item.value}</span>
					</div>
				{/each}
			</div>
		{/snippet}
	</PageToolbar>

	{#if !canViewRoster}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content roster-content">
			{#if ctx.totalPersonnel === 0}
				<EmptyState
					message="No personnel on the active roster. Add one person, or use More -> Bulk Import when you have a roster file."
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
						{#snippet toolbar(tbl)}
							<div class="roster-toolbar">
								<div class="roster-toolbar-copy">
									<span class="roster-kicker">Personnel roster</span>
									<div class="roster-meta">
										<Badge label={`${personnelStore.items.length} total`} variant="outlined" />
										{#if tbl.search && tbl.totalRows !== personnelStore.items.length}
											<Badge label={`${tbl.totalRows} shown`} />
										{/if}
									</div>
								</div>
								<input
									type="search"
									class="input roster-search"
									data-testid="personnel-search"
									aria-label="Search by name, rank, MOS, role, or group"
									placeholder="Search name, rank, MOS, role, or group..."
									bind:value={rosterSearch}
								/>
								<div class="view-toggle">
									<span class="view-label">View:</span>
									<div class="view-toggle-controls" role="group" aria-label="Roster sort mode">
										<button
											class="view-btn"
											type="button"
											aria-pressed={ctx.viewMode === 'alphabetical'}
											class:active={ctx.viewMode === 'alphabetical'}
											onclick={() => (ctx.viewMode = 'alphabetical')}
										>
											A-Z
										</button>
										<button
											class="view-btn"
											type="button"
											aria-pressed={ctx.viewMode === 'by-group'}
											class:active={ctx.viewMode === 'by-group'}
											onclick={() => (ctx.viewMode = 'by-group')}
										>
											By Group
										</button>
									</div>
								</div>
							</div>
						{/snippet}
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
		overflow: hidden;
	}

	.operational-strip {
		display: flex;
		align-items: stretch;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.operational-item {
		display: inline-flex;
		align-items: baseline;
		gap: var(--sp-2);
		min-height: 30px;
		padding: 5px 10px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.operational-item.alert {
		border-color: color-mix(in srgb, var(--amber) 46%, var(--border-default) 54%);
		background: color-mix(in srgb, var(--amber-light) 72%, var(--surface-panel) 28%);
	}

	.operational-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.operational-value {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.btn-ghost {
		appearance: none;
		display: flex;
		align-items: center;
		min-height: 34px;
		padding: 7px 12px;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.btn-ghost:hover {
		color: var(--text-primary);
		border-color: var(--border-default);
		background: var(--surface-subtle);
	}

	.roster-toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-5);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
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

	.roster-toolbar-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-right: auto;
		min-width: 0;
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

	.roster-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.roster-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.roster-search {
		flex: 1 1 260px;
		max-width: 360px;
	}

	.view-toggle {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.view-toggle-controls {
		display: inline-flex;
		align-items: stretch;
	}

	.view-toggle-controls .view-btn + .view-btn {
		margin-left: -1px;
	}

	.view-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.view-btn {
		appearance: none;
		min-height: 32px;
		padding: 0 12px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border: var(--border-thin);
		background: var(--surface-panel);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.view-btn:first-of-type {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}

	.view-btn:last-of-type {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}

	.view-btn:hover {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.view-btn.active {
		background: color-mix(in srgb, var(--amber-light) 86%, var(--surface-panel) 14%);
		border-color: var(--amber);
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
		.operational-strip {
			display: grid;
			grid-template-columns: 1fr;
		}

		.operational-item {
			justify-content: space-between;
		}

		.roster-toolbar {
			flex-wrap: wrap;
			padding: var(--sp-4);
		}

		.roster-search {
			max-width: unset;
			width: 100%;
		}

		.view-toggle {
			width: 100%;
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

		.view-btn,
		.dt-pin-btn {
			min-height: 44px;
		}
	}

	@media (min-width: 641px) and (max-width: 1024px) {
		.roster-search {
			max-width: 300px;
		}
	}
</style>
