<!-- PROTOTYPE Variant C: "Split Rail"
     Two-panel layout: persistent summary rail on the left, scrollable detail on the right.
     Rail shows readiness gauge, status counts, worst types, and group comparison.
     Right panel has filters + detail table. The rail condenses the "at a glance" info
     so the leader can always see summary while scrolling detail.
     Emphasis: persistent context while drilling into detail. -->
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import {
		personnel,
		groups,
		trainingTypes,
		statusCounts,
		overallReadiness,
		totalPersonnel,
		statusLabels,
		statusDotMap,
		statusColorMap,
		readinessTone,
		readinessBarColor,
		readinessBg,
		type TrainingStatus,
		type PersonRow
	} from './mockData';

	let filterGroup = $state('');
	let filterRank = $state('');
	let filterMos = $state('');
	let filterStatus = $state<TrainingStatus | ''>('');
	let searchQuery = $state('');
	let sortCol = $state('name');
	let sortAsc = $state(true);

	const uniqueRanks = [...new Set(personnel.map((p) => p.rank))].sort();
	const uniqueGroups = [...new Set(personnel.map((p) => p.group))].sort();
	const uniqueMos = [...new Set(personnel.map((p) => p.mos))].sort();

	const filtered = $derived(
		personnel.filter((p) => {
			if (filterGroup && p.group !== filterGroup) return false;
			if (filterRank && p.rank !== filterRank) return false;
			if (filterMos && p.mos !== filterMos) return false;
			if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
			if (filterStatus) {
				return Object.values(p.trainings).some((t) => t.status === filterStatus);
			}
			return true;
		})
	);

	const sorted = $derived.by(() => {
		const rows = [...filtered];
		rows.sort((a, b) => {
			let cmp = 0;
			if (sortCol === 'name') cmp = a.name.localeCompare(b.name);
			else if (sortCol === 'rank') cmp = a.rank.localeCompare(b.rank);
			else if (sortCol === 'group') cmp = a.group.localeCompare(b.group);
			else if (sortCol === 'readiness') cmp = a.readiness - b.readiness;
			else {
				const aS = a.trainings[sortCol]?.status ?? 'not-completed';
				const bS = b.trainings[sortCol]?.status ?? 'not-completed';
				const order: Record<TrainingStatus, number> = {
					expired: 0,
					'warning-orange': 1,
					'warning-yellow': 2,
					'not-completed': 3,
					current: 4
				};
				cmp = (order[aS] ?? 99) - (order[bS] ?? 99);
			}
			return sortAsc ? cmp : -cmp;
		});
		return rows;
	});

	function toggleSort(col: string) {
		if (sortCol === col) sortAsc = !sortAsc;
		else {
			sortCol = col;
			sortAsc = true;
		}
	}

	const activeFilterCount = $derived(
		(filterGroup ? 1 : 0) + (filterRank ? 1 : 0) + (filterMos ? 1 : 0) + (filterStatus ? 1 : 0)
	);

	function clearFilters() {
		filterGroup = '';
		filterRank = '';
		filterMos = '';
		filterStatus = '';
		searchQuery = '';
	}

	const sortedWorstTypes = $derived([...trainingTypes].sort((a, b) => a.complianceRate - b.complianceRate).slice(0, 5));

	function ringDasharray(pct: number): string {
		const c = 2 * Math.PI * 40;
		return `${(pct / 100) * c} ${c - (pct / 100) * c}`;
	}
</script>

<div class="flex min-h-0 flex-1 overflow-hidden pb-16">
	<!-- Left rail -->
	<aside class="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-card p-4 lg:flex">
		<!-- Readiness gauge -->
		<div class="flex flex-col items-center gap-1 py-2">
			<svg class="size-28 -rotate-90" viewBox="0 0 100 100">
				<circle cx="50" cy="50" r="40" fill="none" stroke-width="8" class="stroke-muted" />
				<circle
					cx="50"
					cy="50"
					r="40"
					fill="none"
					stroke-width="8"
					stroke-linecap="round"
					class={overallReadiness >= 80
						? 'stroke-success'
						: overallReadiness >= 60
							? 'stroke-warning'
							: 'stroke-destructive'}
					stroke-dasharray={ringDasharray(overallReadiness)}
				/>
				<text
					x="50"
					y="54"
					text-anchor="middle"
					class="fill-foreground font-display text-xl font-bold"
					transform="rotate(90 50 50)">{overallReadiness}%</text
				>
			</svg>
			<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground"
				>Unit Readiness</span
			>
			<span class="text-xs text-muted-foreground">{totalPersonnel} personnel</span>
		</div>

		<hr class="border-border" />

		<!-- Status counts -->
		<div class="space-y-1.5">
			<h3 class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">Status</h3>
			{#each [['current', 'Current', statusCounts.current], ['warning-yellow', '60 Days', statusCounts.warningYellow], ['warning-orange', '30 Days', statusCounts.warningOrange], ['expired', 'Expired', statusCounts.expired], ['not-completed', 'Not Done', statusCounts.notCompleted]] as [status, label, count] (status)}
				<button
					type="button"
					class="flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-muted/50 {filterStatus ===
					status
						? 'bg-muted'
						: ''}"
					onclick={() => (filterStatus = filterStatus === (status as TrainingStatus) ? '' : (status as TrainingStatus))}
				>
					<span class="size-2 rounded-full {statusDotMap[status as TrainingStatus]}"></span>
					<span class="flex-1 text-xs text-foreground">{label}</span>
					<span class="font-mono text-xs font-semibold text-muted-foreground">{count}</span>
				</button>
			{/each}
		</div>

		<hr class="border-border" />

		<!-- Worst types -->
		<div class="space-y-1.5">
			<h3 class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
				Lowest Compliance
			</h3>
			{#each sortedWorstTypes as tt (tt.id)}
				<div class="space-y-0.5">
					<div class="flex items-center justify-between">
						<span class="truncate text-xs text-foreground">{tt.name}</span>
						<span class="font-mono text-[0.625rem] font-semibold {readinessTone(tt.complianceRate)}"
							>{tt.complianceRate}%</span
						>
					</div>
					<div class="h-1.5 overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full {readinessBarColor(tt.complianceRate)}"
							style:width="{tt.complianceRate}%"
						></div>
					</div>
				</div>
			{/each}
		</div>

		<hr class="border-border" />

		<!-- Group comparison -->
		<div class="space-y-1.5">
			<h3 class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">Groups</h3>
			{#each groups as g (g.id)}
				<button
					type="button"
					class="flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/50 {filterGroup ===
					g.name
						? 'bg-muted'
						: ''}"
					onclick={() => (filterGroup = filterGroup === g.name ? '' : g.name)}
				>
					<div>
						<span class="text-xs font-medium text-foreground">{g.name}</span>
						<span class="ml-1 font-mono text-[0.625rem] text-muted-foreground">{g.personnel}</span>
					</div>
					<span class="font-mono text-xs font-semibold {readinessTone(g.readiness)}">{g.readiness}%</span>
				</button>
			{/each}
		</div>
	</aside>

	<!-- Main content -->
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<!-- Header + filters -->
		<div class="border-b bg-card px-4 py-3">
			<div class="flex items-center justify-between">
				<div>
					<h1 class="font-display text-xl font-bold text-foreground">Training Reports</h1>
					<p class="text-xs text-muted-foreground">
						{filtered.length} of {personnel.length} personnel
						{#if activeFilterCount > 0}
							· {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
						{/if}
					</p>
				</div>
				<div class="flex items-center gap-2">
					{#if activeFilterCount > 0}
						<button
							type="button"
							class="rounded border px-2.5 py-1 font-mono text-xs font-semibold text-muted-foreground hover:text-foreground"
							onclick={clearFilters}>Clear filters</button
						>
					{/if}
					<button
						type="button"
						class="rounded border px-2.5 py-1 font-mono text-xs font-semibold text-muted-foreground hover:text-foreground"
					>
						Export
					</button>
				</div>
			</div>
			<!-- Filter row -->
			<div class="mt-2 flex flex-wrap gap-2">
				<select class="h-7 rounded border bg-background px-2 font-mono text-xs" bind:value={filterGroup}>
					<option value="">All Groups</option>
					{#each uniqueGroups as g (g)}<option value={g}>{g}</option>{/each}
				</select>
				<select class="h-7 rounded border bg-background px-2 font-mono text-xs" bind:value={filterRank}>
					<option value="">All Ranks</option>
					{#each uniqueRanks as r (r)}<option value={r}>{r}</option>{/each}
				</select>
				<select class="h-7 rounded border bg-background px-2 font-mono text-xs" bind:value={filterMos}>
					<option value="">All MOS</option>
					{#each uniqueMos as m (m)}<option value={m}>{m}</option>{/each}
				</select>
				<input
					type="search"
					placeholder="Search..."
					class="h-7 w-36 rounded border bg-background px-2 font-mono text-xs placeholder:text-muted-foreground"
					bind:value={searchQuery}
				/>
			</div>
		</div>

		<!-- Table -->
		<div class="flex-1 overflow-auto">
			<table class="w-full text-sm">
				<thead class="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
					<tr>
						{#each [['name', 'Name'], ['rank', 'Rank'], ['group', 'Group'], ['readiness', 'Ready']] as [col, label] (col)}
							<th class="px-3 py-2 text-left">
								<button
									type="button"
									class="inline-flex items-center gap-1 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
									onclick={() => toggleSort(col)}
								>
									{label}
									{#if sortCol === col}
										<span class="text-foreground">{sortAsc ? '▲' : '▼'}</span>
									{/if}
								</button>
							</th>
						{/each}
						{#each trainingTypes as tt (tt.id)}
							<th class="px-2 py-2 text-center">
								<button
									type="button"
									class="inline-flex items-center gap-1 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
									onclick={() => toggleSort(tt.id)}
								>
									{tt.name.length > 10 ? tt.name.slice(0, 10) + '…' : tt.name}
									{#if sortCol === tt.id}
										<span class="text-foreground">{sortAsc ? '▲' : '▼'}</span>
									{/if}
								</button>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each sorted.slice(0, 30) as person (person.id)}
						<tr class="hover:bg-muted/20">
							<td class="px-3 py-1.5 font-medium text-foreground">{person.name}</td>
							<td class="px-3 py-1.5 font-mono text-xs text-muted-foreground">{person.rank}</td>
							<td class="px-3 py-1.5 text-xs text-muted-foreground">{person.group}</td>
							<td class="px-3 py-1.5 text-center">
								<span
									class="inline-flex rounded-full px-2 py-0.5 font-mono text-[0.625rem] font-semibold {readinessBg(
										person.readiness
									)} {readinessTone(person.readiness)}">{person.readiness}%</span
								>
							</td>
							{#each trainingTypes as tt (tt.id)}
								{@const cell = person.trainings[tt.id]}
								<td class="px-2 py-1.5 text-center">
									{#if cell}
										<span
											class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 {statusColorMap[cell.status]}"
											title="{statusLabels[cell.status]}{cell.date ? ` — ${cell.date}` : ''}"
										>
											<span class="size-1.5 rounded-full {statusDotMap[cell.status]}"></span>
											{#if cell.date}
												<span class="font-mono text-[0.5625rem]">{cell.date.slice(5)}</span>
											{:else}
												<span class="font-mono text-[0.5625rem]">—</span>
											{/if}
										</span>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			{#if sorted.length > 30}
				<div class="border-t px-4 py-2 text-center font-mono text-xs text-muted-foreground">
					Showing 30 of {sorted.length}
				</div>
			{/if}
		</div>
	</div>
</div>
