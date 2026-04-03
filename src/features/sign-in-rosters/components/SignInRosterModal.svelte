<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { SignInRoster } from '../sign-in-rosters.types';
	import { ARMY_RANKS, ALL_RANKS } from '$lib/types';
	import { RANK_ORDER } from '$features/personnel/utils/personnelGrouping';
	import type { RowInput } from 'jspdf-autotable';
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import FileUpload from '$lib/components/ui/FileUpload.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		orgId: string;
		personnel: Personnel[];
		groups: { id: string; name: string }[];
		canEdit: boolean;
		onClose: () => void;
	}

	let { orgId, personnel, groups, canEdit, onClose }: Props = $props();

	// Pre-compute rank index map
	const RANK_INDEX = new Map<string, number>(RANK_ORDER.map((rank, index) => [rank, index]));

	// View toggle
	let view = $state<'list' | 'create'>('list');

	// List view state
	let rosters = $state<SignInRoster[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let searchTitle = $state('');
	let dateFrom = $state('');
	let dateTo = $state('');
	let expandedId = $state<string | null>(null);
	let deleting = $state<string | null>(null);
	let confirmDeleteRoster = $state<SignInRoster | null>(null);

	// Create view state
	let title = $state('');
	let dateOption = $state<'specific' | 'blank'>('specific');
	let rosterDate = $state(new Date().toISOString().split('T')[0]);
	let separateByGroup = $state(false);
	let sortBy = $state<'alphabetical' | 'rank'>('alphabetical');
	let selectedRanks = $state<Set<string>>(new Set(ALL_RANKS));
	let selectedGroups = $state<Set<string>>(new Set());
	let saving = $state(false);

	// Fetch rosters
	async function fetchRosters(reset = false) {
		if (reset) rosters = [];
		loading = true;
		const offset = reset ? 0 : rosters.length;
		const params = new URLSearchParams({ limit: '20', offset: String(offset) });
		if (searchTitle) params.set('title', searchTitle);
		if (dateFrom) params.set('from', dateFrom);
		if (dateTo) params.set('to', dateTo);

		const res = await fetch(`/org/${orgId}/api/sign-in-rosters?${params}`);
		const data = await res.json();
		rosters = reset ? data.rosters : [...rosters, ...data.rosters];
		total = data.total;
		loading = false;
	}

	$effect(() => {
		if (view === 'list') {
			fetchRosters(true);
		}
	});

	// Search debounce
	let searchTimeout: ReturnType<typeof setTimeout>;
	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => fetchRosters(true), 300);
	}

	// Category toggles
	const enlistedAndNco = [...ARMY_RANKS.enlisted, ...ARMY_RANKS.nco];
	const allOfficersSelected = $derived(ARMY_RANKS.officer.every((r) => selectedRanks.has(r)));
	const allWarrantSelected = $derived(ARMY_RANKS.warrant.every((r) => selectedRanks.has(r)));
	const allEnlistedSelected = $derived(enlistedAndNco.every((r) => selectedRanks.has(r)));
	const allCiviliansSelected = $derived(ARMY_RANKS.civilian.every((r) => selectedRanks.has(r)));

	function toggleCategory(ranks: readonly string[]) {
		const allSelected = ranks.every((r) => selectedRanks.has(r));
		const next = new Set(selectedRanks);
		if (allSelected) {
			ranks.forEach((r) => next.delete(r));
		} else {
			ranks.forEach((r) => next.add(r));
		}
		selectedRanks = next;
	}

	function toggleRank(rank: string) {
		const next = new Set(selectedRanks);
		if (next.has(rank)) {
			next.delete(rank);
		} else {
			next.add(rank);
		}
		selectedRanks = next;
	}

	function toggleGroup(groupName: string) {
		const next = new Set(selectedGroups);
		if (next.has(groupName)) {
			next.delete(groupName);
		} else {
			next.add(groupName);
		}
		selectedGroups = next;
	}

	// Filtered personnel
	const filteredPersonnel = $derived.by(() => {
		return personnel.filter((p) => {
			if (!selectedRanks.has(p.rank)) return false;
			if (selectedGroups.size > 0 && !selectedGroups.has(p.groupName)) return false;
			return true;
		});
	});

	// Sort personnel for snapshot
	function buildSnapshot(people: Personnel[]) {
		const sorted = people.map((p) => ({
			id: p.id,
			rank: p.rank,
			lastName: p.lastName,
			firstName: p.firstName,
			group: p.groupName
		}));

		if (sortBy === 'rank') {
			sorted.sort((a, b) => {
				const rankA = RANK_INDEX.get(a.rank) ?? RANK_ORDER.length;
				const rankB = RANK_INDEX.get(b.rank) ?? RANK_ORDER.length;
				if (rankA !== rankB) return rankA - rankB;
				const lastDiff = a.lastName.localeCompare(b.lastName);
				if (lastDiff !== 0) return lastDiff;
				return a.firstName.localeCompare(b.firstName);
			});
		} else {
			sorted.sort((a, b) => {
				const lastDiff = a.lastName.localeCompare(b.lastName);
				if (lastDiff !== 0) return lastDiff;
				return a.firstName.localeCompare(b.firstName);
			});
		}

		return sorted;
	}

	// PDF generation using jsPDF
	async function generatePDF(config: {
		title: string;
		rosterDate: string | null;
		blankDate: boolean;
		separateByGroup: boolean;
		sortBy: string;
		personnelSnapshot: { rank: string; lastName: string; firstName: string; group: string }[];
	}) {
		const { jsPDF } = await import('jspdf');
		const { default: autoTable } = await import('jspdf-autotable');
		const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
		const pageWidth = doc.internal.pageSize.getWidth();

		// Title
		doc.setFontSize(18);
		doc.text(config.title, pageWidth / 2, 50, { align: 'center' });

		// Date
		doc.setFontSize(12);
		const dateDisplay = config.blankDate
			? 'Date: _______________'
			: `Date: ${new Date(config.rosterDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
		doc.text(dateDisplay, pageWidth / 2, 70, { align: 'center' });

		// Build table body rows
		const sorted = [...config.personnelSnapshot];
		let rosterGroups: { name: string; people: typeof sorted }[];
		if (config.separateByGroup) {
			const map = new Map<string, typeof sorted>();
			for (const p of sorted) {
				const g = p.group || 'Unassigned';
				if (!map.has(g)) map.set(g, []);
				map.get(g)!.push(p);
			}
			rosterGroups = [...map.entries()].map(([name, people]) => ({ name, people }));
		} else {
			rosterGroups = [{ name: '', people: sorted }];
		}

		const body: RowInput[] = [];
		let rowNum = 0;
		for (const group of rosterGroups) {
			if (config.separateByGroup && group.name) {
				body.push([
					{
						content: group.name,
						colSpan: 4,
						styles: {
							fontStyle: 'bold' as const,
							fillColor: [240, 240, 240] as [number, number, number],
							cellPadding: { top: 8, bottom: 4, left: 4, right: 4 }
						}
					}
				]);
			}
			for (const p of group.people) {
				rowNum++;
				body.push([
					{ content: String(rowNum), styles: { halign: 'center' as const } },
					p.rank,
					`${p.lastName}, ${p.firstName}`,
					''
				]);
			}
		}

		autoTable(doc, {
			startY: 85,
			head: [['#', 'Rank', 'Name', 'Signature']],
			body,
			theme: 'grid',
			headStyles: {
				fillColor: [50, 50, 50],
				textColor: 255,
				fontStyle: 'bold',
				fontSize: 10
			},
			styles: {
				fontSize: 10,
				cellPadding: 5,
				lineColor: [200, 200, 200],
				lineWidth: 0.5
			},
			columnStyles: {
				0: { cellWidth: 30, halign: 'center' },
				1: { cellWidth: 50 },
				2: { cellWidth: 180 },
				3: { cellWidth: 'auto' }
			},
			margin: { left: 40, right: 40 }
		});

		doc.save(`${config.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-')}-sign-in-roster.pdf`);
	}

	// Generate and save
	async function handleGenerate() {
		if (!title.trim() || filteredPersonnel.length === 0 || saving) return;
		saving = true;

		const snapshot = buildSnapshot(filteredPersonnel);
		const config = {
			title: title.trim(),
			rosterDate: dateOption === 'specific' ? rosterDate : null,
			blankDate: dateOption === 'blank',
			separateByGroup,
			sortBy,
			personnelSnapshot: snapshot
		};

		try {
			// Generate PDF first
			await generatePDF(config);
			const res = await fetch(`/org/${orgId}/api/sign-in-rosters`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...config,
					filterConfig: {
						groups: [...selectedGroups],
						ranks: [...selectedRanks]
					}
				})
			});
			if (res.ok) {
				// Reset create form
				title = '';
				dateOption = 'specific';
				rosterDate = new Date().toISOString().split('T')[0];
				separateByGroup = false;
				sortBy = 'alphabetical';
				selectedRanks = new Set(ALL_RANKS);
				selectedGroups = new Set();
				// Switch to list
				view = 'list';
			}
		} finally {
			saving = false;
		}
	}

	// Re-print from saved roster
	async function reprintRoster(roster: SignInRoster) {
		try {
			await generatePDF({
				title: roster.title,
				rosterDate: roster.rosterDate,
				blankDate: roster.blankDate,
				separateByGroup: roster.separateByGroup,
				sortBy: roster.sortBy,
				personnelSnapshot: roster.personnelSnapshot
			});
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Failed to generate PDF');
		}
	}

	function handleSignedScanUploaded(roster: SignInRoster, path: string) {
		roster.signedFilePath = path;
		rosters = [...rosters];
		toastStore.success('Signed scan uploaded');
	}

	function handleSignedScanRemoved(roster: SignInRoster) {
		roster.signedFilePath = null;
		rosters = [...rosters];
		toastStore.success('Signed scan removed');
	}

	// Delete roster
	async function deleteRoster(roster: SignInRoster) {
		deleting = roster.id;
		try {
			const res = await fetch(`/org/${orgId}/api/sign-in-rosters/${roster.id}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				rosters = rosters.filter((r) => r.id !== roster.id);
				total--;
				if (expandedId === roster.id) expandedId = null;
				confirmDeleteRoster = null;
				toastStore.success('Roster deleted');
			}
		} finally {
			deleting = null;
		}
	}

	function formatDate(dateStr: string) {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	const canGenerate = $derived(title.trim().length > 0 && filteredPersonnel.length > 0);
	const selectedRankCount = $derived(selectedRanks.size);
	const selectedGroupCount = $derived(selectedGroups.size);
	const hasActiveListFilters = $derived(!!searchTitle || !!dateFrom || !!dateTo);
	const hasActiveCreateFilters = $derived(selectedRanks.size !== ALL_RANKS.length || selectedGroups.size > 0);

	function resetListFilters() {
		searchTitle = '';
		dateFrom = '';
		dateTo = '';
		fetchRosters(true);
	}

	function resetCreateFilters() {
		selectedRanks = new Set(ALL_RANKS);
		selectedGroups = new Set();
	}
</script>

<Modal title={view === 'list' ? 'Sign-In Rosters' : 'New Sign-In Roster'} {onClose} width="700px">
	{#if view === 'list'}
		<div class="list-view">
			<div class="list-summary">
				<div class="summary-copy">
					<p class="eyebrow">Saved Rosters</p>
					<p class="summary-text">Generate, reprint, and track signed attendance sheets from one place.</p>
				</div>
				<Badge label={`${total} total`} variant="outlined" />
			</div>

			<div class="filter-bar">
				<label class="filter-field filter-field-search">
					<span class="field-label">Title</span>
					<input
						class="input"
						type="text"
						placeholder="Search by title..."
						bind:value={searchTitle}
						oninput={handleSearch}
					/>
				</label>
				<label class="filter-field">
					<span class="field-label">From</span>
					<input class="input date-input" type="date" bind:value={dateFrom} onchange={() => fetchRosters(true)} />
				</label>
				<label class="filter-field">
					<span class="field-label">To</span>
					<input class="input date-input" type="date" bind:value={dateTo} onchange={() => fetchRosters(true)} />
				</label>
				{#if hasActiveListFilters}
					<button class="btn btn-sm" type="button" onclick={resetListFilters}>Clear filters</button>
				{/if}
				{#if canEdit}
					<button class="btn btn-primary btn-sm" type="button" onclick={() => (view = 'create')}>New Roster</button>
				{/if}
			</div>

			{#if loading && rosters.length === 0}
				<div class="loading-center">
					<Spinner size={20} color="var(--text-tertiary)" />
				</div>
			{:else if rosters.length === 0}
				<EmptyState message="No sign-in rosters yet." />
			{:else}
				<div class="roster-list">
					{#each rosters as roster (roster.id)}
						<div class="roster-row" class:expanded={expandedId === roster.id}>
							<button
								class="roster-header"
								type="button"
								onclick={() => (expandedId = expandedId === roster.id ? null : roster.id)}
							>
								<div class="roster-info">
									<span class="roster-title">{roster.title}</span>
									<div class="roster-meta">
										<Badge
											label={roster.blankDate
												? 'Blank date'
												: roster.rosterDate
													? formatDate(roster.rosterDate + 'T00:00:00')
													: 'No date'}
											variant="outlined"
										/>
										<Badge label={`${roster.personnelSnapshot.length} personnel`} variant="outlined" />
										{#if roster.signedFilePath}
											<Badge label="Signed" variant="outlined" />
										{/if}
									</div>
								</div>
								<span class="expand-icon">{expandedId === roster.id ? '\u25B2' : '\u25BC'}</span>
							</button>

							{#if expandedId === roster.id}
								<div class="roster-detail">
									<div class="detail-meta">
										<span>Sort: {roster.sortBy === 'rank' ? 'By rank' : 'Alphabetical'}</span>
										{#if roster.separateByGroup}
											<span>&middot; Separated by group</span>
										{/if}
										<span>&middot; Created {formatDate(roster.createdAt)}</span>
									</div>
									<div class="detail-actions">
										<button class="btn btn-sm btn-secondary" type="button" onclick={() => reprintRoster(roster)}>
											Re-print
										</button>
										{#if canEdit}
											<button
												class="btn btn-sm btn-danger"
												type="button"
												disabled={deleting === roster.id}
												onclick={() => (confirmDeleteRoster = roster)}
											>
												{#if deleting === roster.id}
													<Spinner size={12} /> Deleting...
												{:else}
													Delete
												{/if}
											</button>
										{/if}
									</div>
									{#if canEdit}
										<div class="detail-upload">
											<FileUpload
												filePath={roster.signedFilePath}
												uploadUrl={`/org/${orgId}/api/sign-in-rosters/${roster.id}/upload`}
												downloadUrl={`/org/${orgId}/api/sign-in-rosters/${roster.id}/upload`}
												removeUrl={`/org/${orgId}/api/sign-in-rosters/${roster.id}/upload`}
												onUpload={(path) => handleSignedScanUploaded(roster, path)}
												onRemove={() => handleSignedScanRemoved(roster)}
												label="Signed Scan"
											/>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>

				{#if rosters.length < total}
					<div class="load-more">
						<button
							class="btn btn-sm btn-secondary"
							type="button"
							disabled={loading}
							onclick={() => fetchRosters(false)}
						>
							{#if loading}<Spinner size={12} />{/if}
							Load more
						</button>
					</div>
				{/if}
			{/if}
		</div>
	{:else}
		<div class="create-view">
			<div class="create-summary">
				<div class="summary-copy">
					<p class="eyebrow">New Roster</p>
					<p class="summary-text">Build a printable sign-in sheet from the current personnel snapshot.</p>
				</div>
				<Badge label={`${filteredPersonnel.length} included`} variant="outlined" />
			</div>

			<div class="editor-section">
				<div class="section-heading">Basics</div>
				<label class="label" for="roster-title">Title <span class="required">*</span></label>
				<input id="roster-title" class="input" type="text" placeholder="e.g. Annual AT Sign-In" bind:value={title} />
			</div>

			<div class="editor-section">
				<div class="section-heading">Date</div>
				<div class="radio-group">
					<label class="radio-label">
						<input type="radio" value="specific" bind:group={dateOption} />
						Specific date
					</label>
					<label class="radio-label">
						<input type="radio" value="blank" bind:group={dateOption} />
						Leave blank
					</label>
				</div>
				{#if dateOption === 'specific'}
					<input class="input date-input" type="date" bind:value={rosterDate} />
				{/if}
			</div>

			<div class="form-row">
				<div class="editor-section">
					<div class="section-heading">Sort</div>
					<div class="radio-group">
						<label class="radio-label">
							<input type="radio" value="alphabetical" bind:group={sortBy} />
							Alphabetical
						</label>
						<label class="radio-label">
							<input type="radio" value="rank" bind:group={sortBy} />
							By rank
						</label>
					</div>
				</div>
				<div class="editor-section editor-section-compact">
					<div class="section-heading">Layout</div>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={separateByGroup} />
						Separate by group
					</label>
				</div>
			</div>

			<div class="editor-section">
				<div class="section-header">
					<div class="section-heading">Filter by Rank</div>
					<Badge label={`${selectedRankCount} selected`} variant="outlined" />
				</div>
				<div class="category-toggles">
					<button
						class="chip"
						class:active={allOfficersSelected}
						type="button"
						onclick={() => toggleCategory(ARMY_RANKS.officer)}
					>
						All Officers
					</button>
					<button
						class="chip"
						class:active={allWarrantSelected}
						type="button"
						onclick={() => toggleCategory(ARMY_RANKS.warrant)}
					>
						All Warrant
					</button>
					<button
						class="chip"
						class:active={allEnlistedSelected}
						type="button"
						onclick={() => toggleCategory(enlistedAndNco)}
					>
						All Enlisted
					</button>
					<button
						class="chip"
						class:active={allCiviliansSelected}
						type="button"
						onclick={() => toggleCategory(ARMY_RANKS.civilian)}
					>
						Civilians
					</button>
				</div>
				<div class="rank-chips">
					{#each ALL_RANKS as rank (rank)}
						<button
							class="rank-chip"
							class:active={selectedRanks.has(rank)}
							type="button"
							onclick={() => toggleRank(rank)}
						>
							{rank}
						</button>
					{/each}
				</div>
			</div>

			{#if groups.length > 0}
				<div class="editor-section">
					<div class="section-header">
						<div class="section-heading">Filter by Group</div>
						<Badge
							label={selectedGroupCount > 0 ? `${selectedGroupCount} selected` : 'All groups'}
							variant="outlined"
						/>
					</div>
					<p class="hint">Leave every group unselected to include the full roster.</p>
					<div class="rank-chips">
						{#each groups as group (group.id)}
							<button
								class="rank-chip"
								class:active={selectedGroups.has(group.name)}
								type="button"
								onclick={() => toggleGroup(group.name)}
							>
								{group.name}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="personnel-preview">
				<div class="summary-copy">
					<div class="section-heading">Snapshot</div>
					<p class="preview-text">{filteredPersonnel.length} personnel will be included in the roster.</p>
				</div>
				{#if hasActiveCreateFilters}
					<button class="btn btn-sm" type="button" onclick={resetCreateFilters}>Reset filters</button>
				{/if}
			</div>
		</div>
	{/if}

	{#snippet footer()}
		{#if view === 'list'}
			<button class="btn btn-secondary" type="button" onclick={onClose}>Close</button>
		{:else}
			<button class="btn btn-secondary" type="button" onclick={() => (view = 'list')}>Cancel</button>
			<button class="btn btn-primary" type="button" disabled={!canGenerate || saving} onclick={handleGenerate}>
				{#if saving}<Spinner />{/if}
				{saving ? 'Saving...' : 'Generate & Print'}
			</button>
		{/if}
	{/snippet}
</Modal>

{#if confirmDeleteRoster}
	<ConfirmDialog
		title="Delete Roster"
		message={`Delete "${confirmDeleteRoster.title}"? This removes the saved roster record.`}
		confirmLabel="Delete"
		variant="danger"
		onConfirm={() => {
			if (confirmDeleteRoster) deleteRoster(confirmDeleteRoster);
		}}
		onCancel={() => (confirmDeleteRoster = null)}
	/>
{/if}

<style>
	.list-view {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		min-height: 300px;
	}

	.create-view {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.list-summary,
	.create-summary,
	.personnel-preview {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.summary-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.eyebrow,
	.field-label,
	.section-heading,
	.label {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.summary-text,
	.preview-text,
	.hint {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.65;
		color: var(--text-secondary);
	}

	.hint {
		font-size: var(--text-xs);
		line-height: 1.5;
	}

	.filter-bar {
		display: flex;
		align-items: end;
		flex-wrap: wrap;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.filter-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.filter-field-search {
		flex: 1;
		min-width: 220px;
	}

	.date-input {
		width: 140px;
		flex: none !important;
	}

	.loading-center {
		display: flex;
		justify-content: center;
		padding: var(--sp-8);
	}

	.roster-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.roster-row {
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.roster-row.expanded {
		border-color: color-mix(in srgb, var(--amber) 24%, var(--border-default));
	}

	.roster-header {
		display: flex;
		align-items: center;
		width: 100%;
		padding: var(--sp-4);
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		color: var(--text-primary);
		gap: var(--sp-3);
		font-family: inherit;
	}

	.roster-header:hover {
		background: color-mix(in srgb, var(--surface-subtle) 42%, var(--surface-panel) 58%);
	}

	.roster-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.roster-title {
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
	}

	.roster-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.expand-icon {
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.roster-detail {
		padding: 0 var(--sp-4) var(--sp-4);
	}

	.detail-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.detail-actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.detail-upload {
		margin-top: var(--sp-3);
		max-width: 420px;
	}

	.load-more {
		display: flex;
		justify-content: center;
		padding-top: var(--sp-2);
	}

	.editor-section {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.editor-section-compact {
		justify-content: center;
		min-width: 220px;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
	}

	.required {
		color: var(--danger);
	}

	.radio-group {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
	}

	.radio-label,
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 42%, var(--surface-panel) 58%);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.form-row {
		display: flex;
		gap: var(--sp-4);
		align-items: flex-start;
	}

	.category-toggles,
	.rank-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.chip,
	.rank-chip {
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		border: var(--border-thin);
		background: var(--surface-panel);
		color: var(--text-secondary);
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

	.chip:hover,
	.rank-chip:hover {
		border-color: var(--border-strong);
	}

	.chip.active,
	.rank-chip.active {
		background: color-mix(in srgb, var(--amber-light) 82%, var(--surface-panel) 18%);
		border-color: color-mix(in srgb, var(--amber) 30%, var(--border-default));
		color: var(--amber-dark);
	}

	@media (max-width: 640px) {
		.list-summary,
		.create-summary,
		.personnel-preview,
		.form-row,
		.section-header {
			flex-direction: column;
			align-items: stretch;
		}

		.filter-field-search {
			min-width: 100%;
		}
	}
</style>
