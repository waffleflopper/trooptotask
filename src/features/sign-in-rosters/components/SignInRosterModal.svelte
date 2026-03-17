<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { SignInRoster } from '../sign-in-rosters.types';
	import { ARMY_RANKS, ALL_RANKS } from '$lib/types';
	import { RANK_ORDER } from '$features/personnel/utils/personnelGrouping';
	import { jsPDF } from 'jspdf';
	import autoTable, { type RowInput } from 'jspdf-autotable';
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';

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
	let uploading = $state<string | null>(null);
	let deleting = $state<string | null>(null);

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
	function generatePDF(config: {
		title: string;
		rosterDate: string | null;
		blankDate: boolean;
		separateByGroup: boolean;
		sortBy: string;
		personnelSnapshot: { rank: string; lastName: string; firstName: string; group: string }[];
	}) {
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

		// Generate PDF first
		generatePDF(config);

		// Save to API
		try {
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
	function reprintRoster(roster: SignInRoster) {
		generatePDF({
			title: roster.title,
			rosterDate: roster.rosterDate,
			blankDate: roster.blankDate,
			separateByGroup: roster.separateByGroup,
			sortBy: roster.sortBy,
			personnelSnapshot: roster.personnelSnapshot
		});
	}

	// Upload signed scan
	async function uploadScan(roster: SignInRoster, file: File) {
		uploading = roster.id;
		const formData = new FormData();
		formData.append('file', file);

		try {
			const res = await fetch(`/org/${orgId}/api/sign-in-rosters/${roster.id}/upload`, {
				method: 'POST',
				body: formData
			});
			const data = await res.json();
			if (res.ok) {
				roster.signedFilePath = data.signedFilePath;
				rosters = [...rosters];
			}
		} finally {
			uploading = null;
		}
	}

	// Remove signed scan
	async function removeScan(roster: SignInRoster) {
		const res = await fetch(`/org/${orgId}/api/sign-in-rosters/${roster.id}/upload`, {
			method: 'DELETE'
		});
		if (res.ok) {
			roster.signedFilePath = null;
			rosters = [...rosters];
		}
	}

	// Download signed scan
	async function downloadScan(roster: SignInRoster) {
		if (!roster.signedFilePath) return;
		const res = await fetch(`/org/${orgId}/api/sign-in-rosters/${roster.id}/upload`);
		const data = await res.json();
		if (data.url) {
			window.open(data.url, '_blank');
		}
	}

	// Delete roster
	async function deleteRoster(roster: SignInRoster) {
		if (!confirm(`Delete roster "${roster.title}"?`)) return;
		deleting = roster.id;
		try {
			const res = await fetch(`/org/${orgId}/api/sign-in-rosters/${roster.id}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				rosters = rosters.filter((r) => r.id !== roster.id);
				total--;
				if (expandedId === roster.id) expandedId = null;
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
</script>

<Modal title={view === 'list' ? 'Sign-In Rosters' : 'New Sign-In Roster'} {onClose} width="700px">
	{#if view === 'list'}
		<!-- LIST VIEW -->
		<div class="list-view">
			<div class="filter-bar">
				<input
					class="input"
					type="text"
					placeholder="Search by title..."
					bind:value={searchTitle}
					oninput={handleSearch}
				/>
				<input class="input date-input" type="date" bind:value={dateFrom} onchange={() => fetchRosters(true)} />
				<span class="date-sep">to</span>
				<input class="input date-input" type="date" bind:value={dateTo} onchange={() => fetchRosters(true)} />
				{#if canEdit}
					<button class="btn btn-primary btn-sm" onclick={() => (view = 'create')}> New Roster </button>
				{/if}
			</div>

			{#if loading && rosters.length === 0}
				<div class="loading-center">
					<Spinner size={20} color="var(--color-text-muted)" />
				</div>
			{:else if rosters.length === 0}
				<EmptyState message="No sign-in rosters yet." />
			{:else}
				<div class="roster-list">
					{#each rosters as roster (roster.id)}
						<div class="roster-row" class:expanded={expandedId === roster.id}>
							<button class="roster-header" onclick={() => (expandedId = expandedId === roster.id ? null : roster.id)}>
								<div class="roster-info">
									<span class="roster-title">{roster.title}</span>
									<span class="roster-meta">
										{roster.blankDate
											? 'Blank date'
											: roster.rosterDate
												? formatDate(roster.rosterDate + 'T00:00:00')
												: 'No date'}
										&middot; {roster.personnelSnapshot.length} personnel
										{#if roster.signedFilePath}
											&middot; <span class="signed-indicator">Signed</span>
										{/if}
									</span>
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
										<button class="btn btn-sm btn-secondary" onclick={() => reprintRoster(roster)}> Re-print </button>
										{#if canEdit}
											{#if roster.signedFilePath}
												<button class="btn btn-sm btn-secondary" onclick={() => downloadScan(roster)}>
													Download Scan
												</button>
												<button class="btn btn-sm btn-secondary" onclick={() => removeScan(roster)}>
													Remove Scan
												</button>
											{:else}
												<label class="btn btn-sm btn-secondary upload-label">
													{#if uploading === roster.id}
														<Spinner size={12} /> Uploading...
													{:else}
														Upload Signed Scan
													{/if}
													<input
														type="file"
														accept="application/pdf,image/*"
														class="hidden-input"
														disabled={uploading === roster.id}
														onchange={(e) => {
															const target = e.target as HTMLInputElement;
															const file = target.files?.[0];
															if (file) uploadScan(roster, file);
															target.value = '';
														}}
													/>
												</label>
											{/if}
											<button
												class="btn btn-sm btn-danger"
												disabled={deleting === roster.id}
												onclick={() => deleteRoster(roster)}
											>
												{#if deleting === roster.id}
													<Spinner size={12} /> Deleting...
												{:else}
													Delete
												{/if}
											</button>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>

				{#if rosters.length < total}
					<div class="load-more">
						<button class="btn btn-sm btn-secondary" disabled={loading} onclick={() => fetchRosters(false)}>
							{#if loading}<Spinner size={12} />{/if}
							Load more
						</button>
					</div>
				{/if}
			{/if}
		</div>
	{:else}
		<!-- CREATE VIEW -->
		<div class="create-view">
			<div class="form-group">
				<label class="label" for="roster-title">Title <span class="required">*</span></label>
				<input id="roster-title" class="input" type="text" placeholder="e.g. Annual AT Sign-In" bind:value={title} />
			</div>

			<div class="form-group">
				<!-- svelte-ignore a11y_label_has_associated_control -->
				<label class="label">Date</label>
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
				<div class="form-group">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="label">Sort By</label>
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
				<div class="form-group">
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={separateByGroup} />
						Separate by group
					</label>
				</div>
			</div>

			<div class="form-group">
				<!-- svelte-ignore a11y_label_has_associated_control -->
				<label class="label">Filter by Rank</label>
				<div class="category-toggles">
					<button class="chip" class:active={allOfficersSelected} onclick={() => toggleCategory(ARMY_RANKS.officer)}>
						All Officers
					</button>
					<button class="chip" class:active={allWarrantSelected} onclick={() => toggleCategory(ARMY_RANKS.warrant)}>
						All Warrant
					</button>
					<button class="chip" class:active={allEnlistedSelected} onclick={() => toggleCategory(enlistedAndNco)}>
						All Enlisted
					</button>
					<button class="chip" class:active={allCiviliansSelected} onclick={() => toggleCategory(ARMY_RANKS.civilian)}>
						Civilians
					</button>
				</div>
				<div class="rank-chips">
					{#each ALL_RANKS as rank (rank)}
						<button class="rank-chip" class:active={selectedRanks.has(rank)} onclick={() => toggleRank(rank)}>
							{rank}
						</button>
					{/each}
				</div>
			</div>

			{#if groups.length > 0}
				<div class="form-group">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="label"
						>Filter by Group
						<span class="hint">(none selected = all)</span></label
					>
					<div class="rank-chips">
						{#each groups as group (group.id)}
							<button
								class="rank-chip"
								class:active={selectedGroups.has(group.name)}
								onclick={() => toggleGroup(group.name)}
							>
								{group.name}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="personnel-preview">
				{filteredPersonnel.length} personnel will be included
			</div>
		</div>
	{/if}

	{#snippet footer()}
		{#if view === 'list'}
			<button class="btn btn-secondary" onclick={onClose}>Close</button>
		{:else}
			<button class="btn btn-secondary" onclick={() => (view = 'list')}>Cancel</button>
			<button class="btn btn-primary" disabled={!canGenerate || saving} onclick={handleGenerate}>
				{#if saving}<Spinner />{/if}
				{saving ? 'Saving...' : 'Generate & Print'}
			</button>
		{/if}
	{/snippet}
</Modal>

<style>
	.list-view {
		min-height: 300px;
	}

	.filter-bar {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
		flex-wrap: wrap;
	}

	.filter-bar .input {
		flex: 1;
		min-width: 120px;
	}

	.date-input {
		width: 140px;
		flex: none !important;
	}

	.date-sep {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.loading-center {
		display: flex;
		justify-content: center;
		padding: var(--spacing-xl);
	}

	.roster-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.roster-row {
		background: var(--color-surface);
	}

	.roster-row.expanded {
		background: var(--color-surface-variant, var(--color-surface));
	}

	.roster-header {
		display: flex;
		align-items: center;
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-md);
		background: none;
		border: none;
		border-bottom: 1px solid var(--color-border);
		cursor: pointer;
		text-align: left;
		color: var(--color-text);
		gap: var(--spacing-sm);
		font-family: inherit;
	}

	.roster-header:hover {
		background: var(--color-bg);
	}

	.roster-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.roster-title {
		font-weight: 500;
		font-size: var(--font-size-base);
	}

	.roster-meta {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.signed-indicator {
		color: var(--color-success, #22c55e);
		font-weight: 500;
	}

	.expand-icon {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.roster-detail {
		padding: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.detail-meta {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-sm);
	}

	.detail-actions {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.upload-label {
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.hidden-input {
		display: none;
	}

	.load-more {
		display: flex;
		justify-content: center;
		padding: var(--spacing-md);
	}

	/* Create view */
	.create-view {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.required {
		color: var(--color-error, #ef4444);
	}

	.hint {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.radio-group {
		display: flex;
		gap: var(--spacing-md);
		margin-top: var(--spacing-xs);
	}

	.radio-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
		cursor: pointer;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		cursor: pointer;
		margin-top: var(--spacing-lg);
	}

	.form-row {
		display: flex;
		gap: var(--spacing-lg);
		align-items: flex-start;
	}

	.category-toggles {
		display: flex;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
		margin-bottom: var(--spacing-sm);
	}

	.chip {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: inherit;
	}

	.chip:hover {
		border-color: var(--color-primary);
	}

	.chip.active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.rank-chips {
		display: flex;
		gap: var(--spacing-xs);
		flex-wrap: wrap;
	}

	.rank-chip {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: inherit;
	}

	.rank-chip:hover {
		border-color: var(--color-primary);
	}

	.rank-chip.active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.personnel-preview {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		text-align: center;
	}
</style>
