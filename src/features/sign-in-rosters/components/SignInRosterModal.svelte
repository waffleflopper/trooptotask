<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { SignInRoster } from '../sign-in-rosters.types';
	import { ARMY_RANKS, ALL_RANKS } from '$lib/types';
	import { RANK_ORDER } from '$lib/domain/rosterGrouping';
	import type { RowInput } from 'jspdf-autotable';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Spinner } from '$lib/components/ui/spinner';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { SENSITIVE_FILE_ACCEPT, validateSensitiveFileSelection } from '$lib/storage/sensitiveFiles';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { SvelteMap, SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';

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
	let signedScanDragOverId = $state<string | null>(null);
	const signedScanUploadingIds = new SvelteSet<string>();
	const signedScanErrors = new SvelteMap<string, string>();
	const signedScanSelectedFiles = new SvelteMap<string, string>();

	// Create view state
	let title = $state('');
	let dateOption = $state<'specific' | 'blank'>('specific');
	let rosterDate = $state(new Date().toISOString().split('T')[0]);
	let separateByGroup = $state(false);
	let sortBy = $state<'alphabetical' | 'rank'>('alphabetical');
	let selectedRanks = new SvelteSet<string>(ALL_RANKS);
	let selectedGroups = new SvelteSet<string>();
	let saving = $state(false);

	// Fetch rosters
	async function fetchRosters(reset = false) {
		if (reset) rosters = [];
		loading = true;
		const offset = reset ? 0 : rosters.length;
		const params = new SvelteURLSearchParams({ limit: '20', offset: String(offset) });
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
		if (allSelected) {
			ranks.forEach((r) => selectedRanks.delete(r));
		} else {
			ranks.forEach((r) => selectedRanks.add(r));
		}
	}

	function toggleRank(rank: string) {
		if (selectedRanks.has(rank)) {
			selectedRanks.delete(rank);
		} else {
			selectedRanks.add(rank);
		}
	}

	function toggleGroup(groupName: string) {
		if (selectedGroups.has(groupName)) {
			selectedGroups.delete(groupName);
		} else {
			selectedGroups.add(groupName);
		}
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
			const map = new SvelteMap<string, typeof sorted>();
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
				resetCreateFilters();
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

	function getFilename(path: string): string {
		return path.split('/').pop() ?? path;
	}

	function getSignedScanUploadUrl(roster: SignInRoster): string {
		return `/org/${orgId}/api/sign-in-rosters/${roster.id}/upload`;
	}

	async function uploadSignedScanFile(roster: SignInRoster, file: File) {
		if (signedScanUploadingIds.has(roster.id)) return;

		signedScanSelectedFiles.set(roster.id, file.name);

		const validationError = validateSensitiveFileSelection(file);
		if (validationError) {
			signedScanErrors.set(roster.id, validationError);
			return;
		}

		signedScanErrors.delete(roster.id);
		signedScanUploadingIds.add(roster.id);

		try {
			const formData = new FormData();
			formData.append('file', file);

			const response = await fetch(getSignedScanUploadUrl(roster), {
				method: 'POST',
				body: formData
			});
			const payload = (await response.json()) as {
				filePath?: string;
				error?: string;
			};

			if (!response.ok || !payload.filePath) {
				throw new Error(payload.error ?? 'Upload failed.');
			}

			signedScanSelectedFiles.delete(roster.id);
			handleSignedScanUploaded(roster, payload.filePath);
		} catch (err: unknown) {
			signedScanErrors.set(roster.id, err instanceof Error ? err.message : 'Upload failed.');
		} finally {
			signedScanUploadingIds.delete(roster.id);
		}
	}

	function handleSignedScanFileSelect(roster: SignInRoster, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			uploadSignedScanFile(roster, file);
		}
		input.value = '';
	}

	function handleSignedScanDrop(roster: SignInRoster, event: DragEvent) {
		event.preventDefault();
		signedScanDragOverId = null;
		const file = event.dataTransfer?.files[0];
		if (file) {
			uploadSignedScanFile(roster, file);
		}
	}

	async function downloadSignedScan(roster: SignInRoster) {
		if (!roster.signedFilePath) return;

		const response = await fetch(getSignedScanUploadUrl(roster));
		const payload = (await response.json()) as { url?: string; error?: string };

		if (!response.ok || !payload.url) {
			signedScanErrors.set(roster.id, 'Could not generate download link.');
			return;
		}

		window.open(payload.url, '_blank');
	}

	async function removeSignedScan(roster: SignInRoster) {
		if (!roster.signedFilePath || signedScanUploadingIds.has(roster.id)) return;

		try {
			const response = await fetch(getSignedScanUploadUrl(roster), {
				method: 'DELETE'
			});

			if (!response.ok) {
				const payload = (await response.json()) as { error?: string };
				throw new Error(payload.error ?? 'Remove failed.');
			}

			signedScanErrors.delete(roster.id);
			handleSignedScanRemoved(roster);
		} catch (err: unknown) {
			signedScanErrors.set(roster.id, err instanceof Error ? err.message : 'Remove failed.');
		}
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
		selectedRanks.clear();
		for (const rank of ALL_RANKS) {
			selectedRanks.add(rank);
		}
		selectedGroups.clear();
	}
</script>

<AppDialog.Root closeBlocked={saving} {onClose}>
	<AppDialog.Content closeBlocked={saving} size="wide" class="h-[min(42rem,calc(100dvh-2rem))]">
		<AppDialog.Header>
			<AppDialog.Title>{view === 'list' ? 'Sign-In Rosters' : 'New Sign-In Roster'}</AppDialog.Title>
			<AppDialog.Description>
				Generate printable attendance sheets, reprint saved rosters, and track signed scans.
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="grid gap-4">
			{#if view === 'list'}
				<section
					class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
				>
					<div class="grid gap-1">
						<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
							Saved Rosters
						</p>
						<p class="text-sm leading-relaxed text-muted-foreground">
							Generate, reprint, and track signed attendance sheets from one place.
						</p>
					</div>
					<Badge variant="outline">{total} total</Badge>
				</section>

				<section class="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
					<Field.Root class="min-w-56 flex-1">
						<Field.Label for="roster-search">Title</Field.Label>
						<Input
							id="roster-search"
							type="text"
							placeholder="Search by title..."
							bind:value={searchTitle}
							oninput={handleSearch}
						/>
					</Field.Root>
					<Field.Root class="w-44">
						<Field.Label for="roster-from">From</Field.Label>
						<DatePicker
							id="roster-from"
							bind:value={dateFrom}
							placeholder="From date"
							onValueChange={() => fetchRosters(true)}
						/>
					</Field.Root>
					<Field.Root class="w-44">
						<Field.Label for="roster-to">To</Field.Label>
						<DatePicker
							id="roster-to"
							bind:value={dateTo}
							placeholder="To date"
							onValueChange={() => fetchRosters(true)}
						/>
					</Field.Root>
					{#if hasActiveListFilters}
						<Button variant="outline" size="sm" type="button" onclick={resetListFilters}>Clear filters</Button>
					{/if}
					{#if canEdit}
						<Button size="sm" type="button" onclick={() => (view = 'create')}>New Roster</Button>
					{/if}
				</section>

				{#if loading && rosters.length === 0}
					<div class="flex justify-center p-8">
						<Spinner class="size-5 text-muted-foreground" />
					</div>
				{:else if rosters.length === 0}
					<Empty.Root>
						<Empty.Header>
							<Empty.Title>No sign-in rosters yet.</Empty.Title>
						</Empty.Header>
						{#if canEdit}
							<Empty.Content>
								<Button type="button" onclick={() => (view = 'create')}>New Roster</Button>
							</Empty.Content>
						{/if}
					</Empty.Root>
				{:else}
					<div class="grid gap-3">
						{#each rosters as roster (roster.id)}
							<section
								class="overflow-hidden rounded-lg border border-border bg-card"
								data-expanded={expandedId === roster.id || undefined}
							>
								<button
									class="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
									type="button"
									aria-expanded={expandedId === roster.id}
									onclick={() => (expandedId = expandedId === roster.id ? null : roster.id)}
								>
									<span class="grid min-w-0 flex-1 gap-2">
										<span class="truncate text-base font-semibold text-foreground">{roster.title}</span>
										<span class="flex flex-wrap gap-2">
											<Badge variant="outline">
												{roster.blankDate
													? 'Blank date'
													: roster.rosterDate
														? formatDate(roster.rosterDate + 'T00:00:00')
														: 'No date'}
											</Badge>
											<Badge variant="outline">{roster.personnelSnapshot.length} personnel</Badge>
											{#if roster.signedFilePath}
												<Badge variant="outline">Signed</Badge>
											{/if}
										</span>
									</span>
									<span class="font-mono text-xs text-muted-foreground">
										{expandedId === roster.id ? 'Hide' : 'Show'}
									</span>
								</button>

								{#if expandedId === roster.id}
									<div class="grid gap-3 border-t border-border px-4 py-4">
										<div class="flex flex-wrap gap-2 text-sm text-muted-foreground">
											<span>Sort: {roster.sortBy === 'rank' ? 'By rank' : 'Alphabetical'}</span>
											{#if roster.separateByGroup}
												<span>Separated by group</span>
											{/if}
											<span>Created {formatDate(roster.createdAt)}</span>
										</div>
										<div class="flex flex-wrap gap-2">
											<Button variant="outline" size="sm" type="button" onclick={() => reprintRoster(roster)}>
												Re-print
											</Button>
											{#if canEdit}
												<Button
													variant="destructive"
													size="sm"
													type="button"
													disabled={deleting === roster.id}
													onclick={() => (confirmDeleteRoster = roster)}
												>
													{#if deleting === roster.id}
														<Spinner class="size-3" />
														Deleting...
													{:else}
														Delete
													{/if}
												</Button>
											{/if}
										</div>
										{#if canEdit}
											<Field.Root
												class={[
													'max-w-md rounded-lg border border-dashed border-border bg-background p-3 transition-colors',
													signedScanDragOverId === roster.id && 'border-primary bg-primary/5'
												]}
												ondrop={(event) => handleSignedScanDrop(roster, event)}
												ondragover={(event) => {
													event.preventDefault();
													signedScanDragOverId = roster.id;
												}}
												ondragleave={() => {
													if (signedScanDragOverId === roster.id) {
														signedScanDragOverId = null;
													}
												}}
											>
												<Field.Label for={`signed-scan-${roster.id}`}>Signed Scan</Field.Label>
												{#if signedScanUploadingIds.has(roster.id)}
													<div class="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
														<Spinner class="size-3.5" />
														<span>Uploading {signedScanSelectedFiles.get(roster.id) ?? 'signed scan'}...</span>
													</div>
												{:else if roster.signedFilePath}
													<div class="flex flex-wrap items-center gap-2">
														<Button
															variant="outline"
															size="sm"
															type="button"
															onclick={() => downloadSignedScan(roster)}
														>
															{getFilename(roster.signedFilePath)}
														</Button>
														<Button
															variant="destructive"
															size="sm"
															type="button"
															onclick={() => removeSignedScan(roster)}
														>
															Remove
														</Button>
													</div>
												{:else}
													<Field.Control>
														<Input
															id={`signed-scan-${roster.id}`}
															type="file"
															accept={SENSITIVE_FILE_ACCEPT}
															onchange={(event) => handleSignedScanFileSelect(roster, event)}
														/>
													</Field.Control>
													<Field.Description>Choose a PDF or drop it here.</Field.Description>
												{/if}
												{#if signedScanErrors.get(roster.id)}
													<Field.Error>{signedScanErrors.get(roster.id)}</Field.Error>
												{/if}
											</Field.Root>
										{/if}
									</div>
								{/if}
							</section>
						{/each}
					</div>

					{#if rosters.length < total}
						<div class="flex justify-center pt-2">
							<Button variant="outline" size="sm" type="button" disabled={loading} onclick={() => fetchRosters(false)}>
								{#if loading}<Spinner class="size-3" />{/if}
								Load more
							</Button>
						</div>
					{/if}
				{/if}
			{:else}
				<section
					class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
				>
					<div class="grid gap-1">
						<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">New Roster</p>
						<p class="text-sm leading-relaxed text-muted-foreground">
							Build a printable sign-in sheet from the current personnel snapshot.
						</p>
					</div>
					<Badge variant="outline">{filteredPersonnel.length} included</Badge>
				</section>

				<section class="grid gap-3 rounded-lg border border-border bg-card p-4">
					<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Basics</p>
					<Field.Root>
						<Field.Label for="roster-title">Title <span class="text-destructive">*</span></Field.Label>
						<Input id="roster-title" type="text" placeholder="e.g. Annual AT Sign-In" bind:value={title} />
					</Field.Root>
				</section>

				<section class="grid gap-3 rounded-lg border border-border bg-card p-4">
					<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Date</p>
					<RadioGroup.Root bind:value={dateOption} class="grid gap-2 sm:grid-cols-2">
						<Field.Root orientation="horizontal" class="rounded-lg border border-border bg-background p-3">
							<RadioGroup.Item id="roster-date-specific" value="specific" />
							<Field.Label for="roster-date-specific">Specific date</Field.Label>
						</Field.Root>
						<Field.Root orientation="horizontal" class="rounded-lg border border-border bg-background p-3">
							<RadioGroup.Item id="roster-date-blank" value="blank" />
							<Field.Label for="roster-date-blank">Leave blank</Field.Label>
						</Field.Root>
					</RadioGroup.Root>
					{#if dateOption === 'specific'}
						<Field.Root class="max-w-56">
							<Field.Label for="roster-date">Roster date</Field.Label>
							<DatePicker id="roster-date" bind:value={rosterDate} placeholder="Select roster date" />
						</Field.Root>
					{/if}
				</section>

				<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)]">
					<section class="grid gap-3 rounded-lg border border-border bg-card p-4">
						<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Sort</p>
						<RadioGroup.Root bind:value={sortBy} class="grid gap-2 sm:grid-cols-2">
							<Field.Root orientation="horizontal" class="rounded-lg border border-border bg-background p-3">
								<RadioGroup.Item id="roster-sort-alpha" value="alphabetical" />
								<Field.Label for="roster-sort-alpha">Alphabetical</Field.Label>
							</Field.Root>
							<Field.Root orientation="horizontal" class="rounded-lg border border-border bg-background p-3">
								<RadioGroup.Item id="roster-sort-rank" value="rank" />
								<Field.Label for="roster-sort-rank">By rank</Field.Label>
							</Field.Root>
						</RadioGroup.Root>
					</section>
					<section class="grid content-start gap-3 rounded-lg border border-border bg-card p-4">
						<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Layout</p>
						<Field.Root orientation="horizontal" class="rounded-lg border border-border bg-background p-3">
							<Checkbox id="roster-separate-group" bind:checked={separateByGroup} />
							<Field.Label for="roster-separate-group">Separate by group</Field.Label>
						</Field.Root>
					</section>
				</div>

				<section class="grid gap-3 rounded-lg border border-border bg-card p-4">
					<div class="flex items-center justify-between gap-3">
						<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
							Filter by Rank
						</p>
						<Badge variant="outline">{selectedRankCount} selected</Badge>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button
							variant={allOfficersSelected ? 'secondary' : 'outline'}
							size="sm"
							type="button"
							aria-pressed={allOfficersSelected}
							onclick={() => toggleCategory(ARMY_RANKS.officer)}
						>
							All Officers
						</Button>
						<Button
							variant={allWarrantSelected ? 'secondary' : 'outline'}
							size="sm"
							type="button"
							aria-pressed={allWarrantSelected}
							onclick={() => toggleCategory(ARMY_RANKS.warrant)}
						>
							All Warrant
						</Button>
						<Button
							variant={allEnlistedSelected ? 'secondary' : 'outline'}
							size="sm"
							type="button"
							aria-pressed={allEnlistedSelected}
							onclick={() => toggleCategory(enlistedAndNco)}
						>
							All Enlisted
						</Button>
						<Button
							variant={allCiviliansSelected ? 'secondary' : 'outline'}
							size="sm"
							type="button"
							aria-pressed={allCiviliansSelected}
							onclick={() => toggleCategory(ARMY_RANKS.civilian)}
						>
							Civilians
						</Button>
					</div>
					<div class="flex flex-wrap gap-2">
						{#each ALL_RANKS as rank (rank)}
							<Button
								variant={selectedRanks.has(rank) ? 'secondary' : 'outline'}
								size="sm"
								type="button"
								aria-pressed={selectedRanks.has(rank)}
								onclick={() => toggleRank(rank)}
							>
								{rank}
							</Button>
						{/each}
					</div>
				</section>

				{#if groups.length > 0}
					<section class="grid gap-3 rounded-lg border border-border bg-card p-4">
						<div class="flex items-center justify-between gap-3">
							<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
								Filter by Group
							</p>
							<Badge variant="outline">{selectedGroupCount > 0 ? `${selectedGroupCount} selected` : 'All groups'}</Badge
							>
						</div>
						<p class="text-xs leading-relaxed text-muted-foreground">
							Leave every group unselected to include the full roster.
						</p>
						<div class="flex flex-wrap gap-2">
							{#each groups as group (group.id)}
								<Button
									variant={selectedGroups.has(group.name) ? 'secondary' : 'outline'}
									size="sm"
									type="button"
									aria-pressed={selectedGroups.has(group.name)}
									onclick={() => toggleGroup(group.name)}
								>
									{group.name}
								</Button>
							{/each}
						</div>
					</section>
				{/if}

				<section
					class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
				>
					<div class="grid gap-1">
						<p class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Snapshot</p>
						<p class="text-sm leading-relaxed text-muted-foreground">
							{filteredPersonnel.length} personnel will be included in the roster.
						</p>
					</div>
					{#if hasActiveCreateFilters}
						<Button variant="outline" size="sm" type="button" onclick={resetCreateFilters}>Reset filters</Button>
					{/if}
				</section>
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if view === 'list'}
				<Button variant="outline" type="button" onclick={onClose}>Close</Button>
			{:else}
				<Button variant="outline" type="button" onclick={() => (view = 'list')} disabled={saving}>Cancel</Button>
				<Button type="button" disabled={!canGenerate || saving} onclick={handleGenerate}>
					{#if saving}<Spinner class="size-4" />{/if}
					{saving ? 'Saving...' : 'Generate & Print'}
				</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

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
