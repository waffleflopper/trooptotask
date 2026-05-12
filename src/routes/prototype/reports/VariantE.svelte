<!-- PROTOTYPE Variant E: "Card Grid + Command Dashboard" combo
     Top: hero readiness bar with status pills, group filter pills, then training-type card grid
     with compliance rings and expandable expired/expiring personnel lists.
     Bottom: two-column analysis (type compliance bars + group readiness) and full detail table
     with dot-coded status cells.
     Emphasis: training-type cards give actionable "what needs attention" at a glance,
     then scroll down for full analysis and person-level detail. -->
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
	let expandedType = $state<string | null>(null);
	let showFilters = $state(false);

	const uniqueRanks = [...new Set(personnel.map((p) => p.rank))].sort();
	const uniqueGroups = [...new Set(personnel.map((p) => p.group))].sort();

	const filtered = $derived(
		personnel.filter((p) => {
			if (filterGroup && p.group !== filterGroup) return false;
			if (filterRank && p.rank !== filterRank) return false;
			if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
			if (filterStatus) {
				return Object.values(p.trainings).some((t) => t.status === filterStatus);
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

	function computeTypeStats(typeId: string) {
		let current = 0;
		let warningYellow = 0;
		let warningOrange = 0;
		let expired = 0;
		let notCompleted = 0;
		const expiredPersonnel: PersonRow[] = [];
		const expiringPersonnel: PersonRow[] = [];

		for (const p of filtered) {
			const t = p.trainings[typeId];
			if (!t) continue;
			switch (t.status) {
				case 'current':
					current++;
					break;
				case 'warning-yellow':
					warningYellow++;
					expiringPersonnel.push(p);
					break;
				case 'warning-orange':
					warningOrange++;
					expiringPersonnel.push(p);
					break;
				case 'expired':
					expired++;
					expiredPersonnel.push(p);
					break;
				case 'not-completed':
					notCompleted++;
					expiredPersonnel.push(p);
					break;
			}
		}
		const total = filtered.length;
		const compliance = total > 0 ? Math.round((current / total) * 100) : 0;
		return {
			current,
			warningYellow,
			warningOrange,
			expired,
			notCompleted,
			compliance,
			total,
			expiredPersonnel,
			expiringPersonnel
		};
	}

	function ringDasharray(pct: number, r = 36): string {
		const c = 2 * Math.PI * r;
		return `${(pct / 100) * c} ${c - (pct / 100) * c}`;
	}

	function ringColor(pct: number): string {
		if (pct >= 80) return 'stroke-success';
		if (pct >= 60) return 'stroke-warning';
		return 'stroke-destructive';
	}

	const sortedWorstTypes = $derived([...trainingTypes].sort((a, b) => a.complianceRate - b.complianceRate));
</script>

<div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 pb-20 md:p-6">
	<!-- ───────────────────────── HERO BAR ───────────────────────── -->
	<div class="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-4">
			<svg class="size-16 -rotate-90 shrink-0" viewBox="0 0 80 80">
				<circle cx="40" cy="40" r="36" fill="none" stroke-width="5" class="stroke-muted" />
				<circle
					cx="40"
					cy="40"
					r="36"
					fill="none"
					stroke-width="5"
					stroke-linecap="round"
					class={ringColor(overallReadiness)}
					stroke-dasharray={ringDasharray(overallReadiness)}
				/>
			</svg>
			<div>
				<h1 class="font-display text-2xl font-bold tracking-tight text-foreground">Training Readiness</h1>
				<p class="text-sm text-muted-foreground">
					<span class="font-semibold {readinessTone(overallReadiness)}">{overallReadiness}%</span> across
					{totalPersonnel} personnel
				</p>
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#each [['current', statusCounts.current], ['expired', statusCounts.expired], ['warning-orange', statusCounts.warningOrange + statusCounts.warningYellow], ['not-completed', statusCounts.notCompleted]] as [status, count] (status)}
				<button
					type="button"
					class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors hover:bg-muted/50 {filterStatus ===
					status
						? 'border-foreground bg-muted'
						: 'border-border'}"
					onclick={() => (filterStatus = filterStatus === (status as TrainingStatus) ? '' : (status as TrainingStatus))}
				>
					<span class="size-2 rounded-full {statusDotMap[status as TrainingStatus]}"></span>
					<span class="font-mono text-[0.625rem] font-semibold text-foreground">{count}</span>
					<span class="font-mono text-[0.625rem] text-muted-foreground">{statusLabels[status as TrainingStatus]}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- ───────────────────────── GROUP FILTER PILLS ───────────────────────── -->
	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			class="rounded-full border px-3 py-1 font-mono text-xs font-semibold transition-colors {filterGroup === ''
				? 'border-foreground bg-foreground text-background'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => (filterGroup = '')}>All</button
		>
		{#each groups as g (g.id)}
			<button
				type="button"
				class="rounded-full border px-3 py-1 font-mono text-xs font-semibold transition-colors {filterGroup === g.name
					? 'border-foreground bg-foreground text-background'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (filterGroup = filterGroup === g.name ? '' : g.name)}>{g.name}</button
			>
		{/each}

		<div class="flex-1"></div>

		{#if activeFilterCount > 0 || searchQuery}
			<button
				type="button"
				class="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
				onclick={clearFilters}>Clear all</button
			>
		{/if}
	</div>

	<!-- ───────────────────────── TRAINING TYPE CARDS ───────────────────────── -->
	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
		{#each trainingTypes as tt (tt.id)}
			{@const stats = computeTypeStats(tt.id)}
			<button
				type="button"
				class="group flex flex-col items-start rounded-lg border bg-card p-4 text-left transition-all hover:shadow-md {expandedType ===
				tt.id
					? 'ring-2 ring-foreground/20'
					: ''}"
				onclick={() => (expandedType = expandedType === tt.id ? null : tt.id)}
			>
				<div class="flex w-full items-start justify-between gap-3">
					<div class="flex-1">
						<h3 class="text-sm font-semibold text-foreground">{tt.name}</h3>
						<p class="mt-0.5 font-mono text-[0.625rem] text-muted-foreground">{stats.total} personnel</p>
					</div>
					<svg class="size-11 -rotate-90 shrink-0" viewBox="0 0 80 80">
						<circle cx="40" cy="40" r="36" fill="none" stroke-width="6" class="stroke-muted" />
						<circle
							cx="40"
							cy="40"
							r="36"
							fill="none"
							stroke-width="6"
							stroke-linecap="round"
							class={ringColor(stats.compliance)}
							stroke-dasharray={ringDasharray(stats.compliance)}
						/>
						<text
							x="40"
							y="44"
							text-anchor="middle"
							class="fill-foreground font-mono text-[0.8125rem] font-bold"
							transform="rotate(90 40 40)">{stats.compliance}</text
						>
					</svg>
				</div>

				<!-- Stacked status bar -->
				<div class="mt-3 flex h-2 w-full overflow-hidden rounded-full">
					{#if stats.current > 0}
						<div class="bg-success" style:width="{(stats.current / stats.total) * 100}%"></div>
					{/if}
					{#if stats.warningYellow + stats.warningOrange > 0}
						<div
							class="bg-warning"
							style:width="{((stats.warningYellow + stats.warningOrange) / stats.total) * 100}%"
						></div>
					{/if}
					{#if stats.expired > 0}
						<div class="bg-destructive" style:width="{(stats.expired / stats.total) * 100}%"></div>
					{/if}
					{#if stats.notCompleted > 0}
						<div class="bg-muted-foreground/30" style:width="{(stats.notCompleted / stats.total) * 100}%"></div>
					{/if}
				</div>

				<!-- Counts row -->
				<div class="mt-2.5 flex w-full flex-wrap gap-x-3 gap-y-1">
					{#if stats.expired > 0}
						<span class="font-mono text-[0.625rem] text-destructive">{stats.expired} expired</span>
					{/if}
					{#if stats.warningYellow + stats.warningOrange > 0}
						<span class="font-mono text-[0.625rem] text-warning-foreground"
							>{stats.warningYellow + stats.warningOrange} expiring</span
						>
					{/if}
					{#if stats.notCompleted > 0}
						<span class="font-mono text-[0.625rem] text-muted-foreground">{stats.notCompleted} not done</span>
					{/if}
				</div>

				<!-- Expanded: who's expired/expiring -->
				{#if expandedType === tt.id && (stats.expiredPersonnel.length > 0 || stats.expiringPersonnel.length > 0)}
					<div class="mt-3 w-full border-t pt-3">
						{#if stats.expiredPersonnel.length > 0}
							<p class="mb-1 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-destructive">
								Expired / Not Done
							</p>
							<ul class="space-y-0.5">
								{#each stats.expiredPersonnel.slice(0, 6) as p (p.id)}
									<li class="flex items-center justify-between text-xs">
										<span class="text-foreground">{p.name}</span>
										<span class="font-mono text-[0.625rem] text-muted-foreground">{p.rank} · {p.group}</span>
									</li>
								{/each}
								{#if stats.expiredPersonnel.length > 6}
									<li class="font-mono text-[0.625rem] text-muted-foreground">
										+{stats.expiredPersonnel.length - 6} more
									</li>
								{/if}
							</ul>
						{/if}
						{#if stats.expiringPersonnel.length > 0}
							<p
								class="mb-1 mt-2 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-warning-foreground"
							>
								Expiring Soon
							</p>
							<ul class="space-y-0.5">
								{#each stats.expiringPersonnel.slice(0, 4) as p (p.id)}
									<li class="flex items-center justify-between text-xs">
										<span class="text-foreground">{p.name}</span>
										<span class="font-mono text-[0.625rem] text-muted-foreground">{p.rank} · {p.group}</span>
									</li>
								{/each}
								{#if stats.expiringPersonnel.length > 4}
									<li class="font-mono text-[0.625rem] text-muted-foreground">
										+{stats.expiringPersonnel.length - 4} more
									</li>
								{/if}
							</ul>
						{/if}
					</div>
				{/if}
			</button>
		{/each}
	</div>

	<!-- ───────────────────────── TWO-COLUMN ANALYSIS ───────────────────────── -->
	<div class="grid gap-4 lg:grid-cols-2">
		<!-- Training type compliance bars -->
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

		<!-- Group readiness -->
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

	<!-- ───────────────────────── DETAIL TABLE ───────────────────────── -->
	<section class="overflow-hidden rounded-lg border bg-card">
		<div class="flex items-center justify-between border-b px-4 py-3">
			<div>
				<h2 class="text-sm font-semibold text-foreground">Personnel Detail</h2>
				<p class="text-xs text-muted-foreground">{filtered.length} of {personnel.length} personnel</p>
			</div>
			<div class="flex items-center gap-2">
				<!-- Inline filters for the table -->
				<select class="h-7 rounded border bg-background px-2 font-mono text-xs text-foreground" bind:value={filterRank}>
					<option value="">All Ranks</option>
					{#each uniqueRanks as r (r)}
						<option value={r}>{r}</option>
					{/each}
				</select>
				<input
					type="search"
					placeholder="Search name..."
					class="h-7 w-36 rounded border bg-background px-2 font-mono text-xs text-foreground placeholder:text-muted-foreground"
					bind:value={searchQuery}
				/>
				<button
					type="button"
					class="rounded border px-3 py-1 font-mono text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					Export CSV
				</button>
			</div>
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
