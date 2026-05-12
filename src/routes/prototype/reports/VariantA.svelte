<!-- PROTOTYPE Variant A: "Command Dashboard"
     Big readiness gauge at top, status row, then two-column: worst training types + group comparison.
     Filters in a collapsible toolbar. Detail table below with inline status cells.
     Emphasis: executive snapshot first, drill-down second. -->
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
	let filterStatus = $state<TrainingStatus | ''>('');
	let searchQuery = $state('');
	let showFilters = $state(false);

	const uniqueRanks = $derived([...new Set(personnel.map((p) => p.rank))].sort());
	const uniqueGroups = $derived([...new Set(personnel.map((p) => p.group))].sort());

	const filtered = $derived(
		personnel.filter((p) => {
			if (filterGroup && p.group !== filterGroup) return false;
			if (filterRank && p.rank !== filterRank) return false;
			if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
			if (filterStatus) {
				const hasStatus = Object.values(p.trainings).some((t) => t.status === filterStatus);
				if (!hasStatus) return false;
			}
			return true;
		})
	);

	const activeFilterCount = $derived((filterGroup ? 1 : 0) + (filterRank ? 1 : 0) + (filterStatus ? 1 : 0));

	function clearFilters() {
		filterGroup = '';
		filterRank = '';
		filterStatus = '';
		searchQuery = '';
	}

	const sortedWorstTypes = $derived([...trainingTypes].sort((a, b) => a.complianceRate - b.complianceRate));
</script>

<div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 pb-20 md:p-6">
	<!-- Header -->
	<header class="flex flex-col gap-1">
		<h1 class="font-display text-2xl font-bold tracking-tight text-foreground">Training Readiness</h1>
		<p class="text-sm text-muted-foreground">
			Unit snapshot — {totalPersonnel} personnel across {groups.length} groups
		</p>
	</header>

	<!-- Hero readiness gauge + status strip -->
	<div class="grid gap-4 md:grid-cols-[1fr_2fr]">
		<!-- Big readiness number -->
		<div class="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-6">
			<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground"
				>Overall Readiness</span
			>
			<span class="font-display text-6xl font-extrabold leading-none {readinessTone(overallReadiness)}"
				>{overallReadiness}%</span
			>
			<div class="mt-1 h-2 w-full max-w-48 overflow-hidden rounded-full bg-muted">
				<div class="h-full rounded-full {readinessBarColor(overallReadiness)}" style:width="{overallReadiness}%"></div>
			</div>
			<span class="text-xs text-muted-foreground">{filtered.length} personnel shown</span>
		</div>

		<!-- Status breakdown cards -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
			{#each [['current', 'Current', statusCounts.current], ['warning-yellow', '60 Days', statusCounts.warningYellow], ['warning-orange', '30 Days', statusCounts.warningOrange], ['expired', 'Expired', statusCounts.expired], ['not-completed', 'Not Done', statusCounts.notCompleted]] as [status, label, count] (status)}
				<button
					type="button"
					class="group flex flex-col items-start gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/50 {filterStatus ===
					status
						? 'border-foreground bg-muted/40'
						: 'border-border'}"
					onclick={() => (filterStatus = filterStatus === (status as TrainingStatus) ? '' : (status as TrainingStatus))}
				>
					<div class="flex items-center gap-1.5">
						<span class="inline-block size-2 rounded-full {statusDotMap[status as TrainingStatus]}"></span>
						<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground"
							>{label}</span
						>
					</div>
					<span class="text-2xl font-bold text-foreground">{count}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Filter toolbar -->
	<div class="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
		<button
			type="button"
			class="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
			onclick={() => (showFilters = !showFilters)}
		>
			<svg
				class="size-3.5 transition-transform {showFilters ? 'rotate-90' : ''}"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				<path d="M6 4l4 4-4 4" />
			</svg>
			Filters
			{#if activeFilterCount > 0}
				<Badge variant="secondary" class="ml-1 text-[0.5625rem]">{activeFilterCount}</Badge>
			{/if}
		</button>

		{#if showFilters}
			<div class="flex flex-1 flex-wrap items-center gap-2">
				<select
					class="h-8 rounded border bg-background px-2 font-mono text-xs text-foreground"
					bind:value={filterGroup}
				>
					<option value="">All Groups</option>
					{#each uniqueGroups as g (g)}
						<option value={g}>{g}</option>
					{/each}
				</select>
				<select class="h-8 rounded border bg-background px-2 font-mono text-xs text-foreground" bind:value={filterRank}>
					<option value="">All Ranks</option>
					{#each uniqueRanks as r (r)}
						<option value={r}>{r}</option>
					{/each}
				</select>
				<input
					type="search"
					placeholder="Search name..."
					class="h-8 w-44 rounded border bg-background px-2 font-mono text-xs text-foreground placeholder:text-muted-foreground"
					bind:value={searchQuery}
				/>
				{#if activeFilterCount > 0 || searchQuery}
					<button
						type="button"
						class="font-mono text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
						onclick={clearFilters}>Clear</button
					>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Two-column analysis -->
	<div class="grid gap-4 lg:grid-cols-2">
		<!-- Worst training types -->
		<section class="rounded-lg border bg-card">
			<div class="border-b px-4 py-3">
				<h2 class="text-sm font-semibold text-foreground">Training Type Compliance</h2>
				<p class="text-xs text-muted-foreground">Sorted by lowest compliance first</p>
			</div>
			<div class="divide-y">
				{#each sortedWorstTypes as tt (tt.id)}
					<div class="flex items-center gap-3 px-4 py-2.5">
						<span class="w-32 truncate text-sm font-medium text-foreground">{tt.name}</span>
						<div class="flex-1">
							<div class="h-2.5 overflow-hidden rounded-full bg-muted">
								<div
									class="h-full rounded-full {readinessBarColor(tt.complianceRate)}"
									style:width="{tt.complianceRate}%"
								></div>
							</div>
						</div>
						<span class="w-10 text-right font-mono text-xs font-semibold {readinessTone(tt.complianceRate)}"
							>{tt.complianceRate}%</span
						>
						{#if tt.expired > 0}
							<span class="w-16 text-right font-mono text-[0.625rem] text-destructive">{tt.expired} exp</span>
						{/if}
					</div>
				{/each}
			</div>
		</section>

		<!-- Group comparison -->
		<section class="rounded-lg border bg-card">
			<div class="border-b px-4 py-3">
				<h2 class="text-sm font-semibold text-foreground">Group Readiness</h2>
				<p class="text-xs text-muted-foreground">Click to filter by group</p>
			</div>
			<div class="divide-y">
				{#each groups as g (g.id)}
					<button
						type="button"
						class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 {filterGroup ===
						g.name
							? 'bg-muted/60'
							: ''}"
						onclick={() => (filterGroup = filterGroup === g.name ? '' : g.name)}
					>
						<div class="flex-1">
							<div class="flex items-baseline gap-2">
								<span class="text-sm font-semibold text-foreground">{g.name}</span>
								<span class="font-mono text-[0.625rem] text-muted-foreground">{g.personnel} pers</span>
							</div>
							<div class="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
								<div class="h-full rounded-full {readinessBarColor(g.readiness)}" style:width="{g.readiness}%"></div>
							</div>
						</div>
						<div class="text-right">
							<span class="font-display text-2xl font-bold {readinessTone(g.readiness)}">{g.readiness}%</span>
							{#if g.expired > 0}
								<p class="font-mono text-[0.625rem] text-destructive">{g.expired} expired</p>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		</section>
	</div>

	<!-- Detail table -->
	<section class="overflow-hidden rounded-lg border bg-card">
		<div class="flex items-center justify-between border-b px-4 py-3">
			<div>
				<h2 class="text-sm font-semibold text-foreground">Personnel Detail</h2>
				<p class="text-xs text-muted-foreground">{filtered.length} of {personnel.length} personnel</p>
			</div>
			<button
				type="button"
				class="rounded border px-3 py-1.5 font-mono text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			>
				Export CSV
			</button>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b bg-muted/30">
						<th
							class="sticky left-0 bg-muted/30 px-4 py-2 text-left font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground"
							>Name</th
						>
						<th
							class="px-3 py-2 text-left font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground"
							>Rank</th
						>
						<th
							class="px-3 py-2 text-left font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground"
							>Group</th
						>
						<th
							class="px-3 py-2 text-center font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground"
							>Ready</th
						>
						{#each trainingTypes as tt (tt.id)}
							<th
								class="px-2 py-2 text-center font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground"
								>{tt.name}</th
							>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each filtered.slice(0, 25) as person (person.id)}
						<tr class="hover:bg-muted/20">
							<td class="sticky left-0 bg-card px-4 py-2 font-medium text-foreground">{person.name}</td>
							<td class="px-3 py-2 font-mono text-xs text-muted-foreground">{person.rank}</td>
							<td class="px-3 py-2 text-xs text-muted-foreground">{person.group}</td>
							<td class="px-3 py-2 text-center">
								<span
									class="inline-flex rounded-full px-2 py-0.5 font-mono text-[0.625rem] font-semibold {readinessBg(
										person.readiness
									)} {readinessTone(person.readiness)}">{person.readiness}%</span
								>
							</td>
							{#each trainingTypes as tt (tt.id)}
								{@const cell = person.trainings[tt.id]}
								<td class="px-2 py-2 text-center">
									{#if cell}
										<span
											class="inline-block size-2.5 rounded-full {statusDotMap[cell.status]}"
											title="{statusLabels[cell.status]}{cell.date ? ` — ${cell.date}` : ''}"
										></span>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if filtered.length > 25}
			<div class="border-t px-4 py-2 text-center font-mono text-xs text-muted-foreground">
				Showing 25 of {filtered.length} — pagination in production
			</div>
		{/if}
	</section>
</div>
