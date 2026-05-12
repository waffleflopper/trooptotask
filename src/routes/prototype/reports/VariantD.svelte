<!-- PROTOTYPE Variant D: "Dense Ops Table"
     Maximally dense, heatmap-style view. The table IS the report.
     Cells use full background color coding. Top row of compact KPI tiles.
     Designed for a leader who wants to see everything at once on a single screen.
     No expanding sections — just raw information density with color as signal.
     Emphasis: scan the whole unit in one glance. -->
<script lang="ts">
	import {
		personnel,
		groups,
		trainingTypes,
		statusCounts,
		overallReadiness,
		totalPersonnel,
		statusLabels,
		statusDotMap,
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
	let hoveredType = $state<string | null>(null);
	let hoveredPerson = $state<string | null>(null);

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

	const sorted = $derived([...filtered].sort((a, b) => a.readiness - b.readiness));

	const cellBgMap: Record<TrainingStatus, string> = {
		current: 'bg-success/20',
		'warning-yellow': 'bg-amber-light',
		'warning-orange': 'bg-warning/30',
		expired: 'bg-danger/25',
		'not-completed': 'bg-muted'
	};

	const cellBgHoverMap: Record<TrainingStatus, string> = {
		current: 'bg-success/35',
		'warning-yellow': 'bg-warning/35',
		'warning-orange': 'bg-warning/45',
		expired: 'bg-danger/40',
		'not-completed': 'bg-muted-foreground/20'
	};

	function cellBg(status: TrainingStatus, typeId: string, personId: string): string {
		if (hoveredType === typeId || hoveredPerson === personId) {
			return cellBgHoverMap[status];
		}
		return cellBgMap[status];
	}

	const activeFilterCount = $derived((filterGroup ? 1 : 0) + (filterRank ? 1 : 0) + (filterStatus ? 1 : 0));

	function clearFilters() {
		filterGroup = '';
		filterRank = '';
		filterStatus = '';
		searchQuery = '';
	}

	function computeColCompliance(typeId: string): number {
		let current = 0;
		for (const p of filtered) {
			if (p.trainings[typeId]?.status === 'current') current++;
		}
		return filtered.length > 0 ? Math.round((current / filtered.length) * 100) : 0;
	}
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden pb-16">
	<!-- Compact KPI strip -->
	<div class="flex flex-wrap items-stretch gap-px border-b bg-border">
		<!-- Readiness -->
		<div class="flex items-center gap-2 bg-card px-4 py-2">
			<span class="font-display text-3xl font-extrabold leading-none {readinessTone(overallReadiness)}"
				>{overallReadiness}%</span
			>
			<div>
				<span class="font-mono text-[0.5625rem] font-semibold uppercase tracking-widest text-muted-foreground"
					>Readiness</span
				>
				<p class="font-mono text-[0.5625rem] text-muted-foreground">{totalPersonnel} pers</p>
			</div>
		</div>
		<!-- Status counts as clickable pills -->
		{#each [['current', 'CUR', statusCounts.current], ['warning-yellow', '60D', statusCounts.warningYellow], ['warning-orange', '30D', statusCounts.warningOrange], ['expired', 'EXP', statusCounts.expired], ['not-completed', 'N/D', statusCounts.notCompleted]] as [status, label, count] (status)}
			<button
				type="button"
				class="flex items-center gap-1.5 bg-card px-3 py-2 transition-colors hover:bg-muted/50 {filterStatus === status
					? 'bg-muted'
					: ''}"
				onclick={() => (filterStatus = filterStatus === (status as TrainingStatus) ? '' : (status as TrainingStatus))}
			>
				<span class="size-2 rounded-full {statusDotMap[status as TrainingStatus]}"></span>
				<span class="font-mono text-sm font-bold text-foreground">{count}</span>
				<span class="font-mono text-[0.5625rem] font-semibold uppercase text-muted-foreground">{label}</span>
			</button>
		{/each}
		<!-- Spacer -->
		<div class="flex-1 bg-card"></div>
		<!-- Group filter pills -->
		<div class="flex items-center gap-1 bg-card px-3">
			<button
				type="button"
				class="rounded px-2 py-0.5 font-mono text-[0.5625rem] font-semibold uppercase {filterGroup === ''
					? 'bg-foreground text-background'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (filterGroup = '')}>All</button
			>
			{#each groups as g (g.id)}
				<button
					type="button"
					class="rounded px-2 py-0.5 font-mono text-[0.5625rem] font-semibold uppercase {filterGroup === g.name
						? 'bg-foreground text-background'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (filterGroup = filterGroup === g.name ? '' : g.name)}
				>
					{g.name.replace(' Platoon', '').replace('HQ ', 'HQ')}
				</button>
			{/each}
		</div>
		<!-- Search + actions -->
		<div class="flex items-center gap-2 bg-card px-3">
			<input
				type="search"
				placeholder="Search..."
				class="h-6 w-28 rounded border bg-background px-2 font-mono text-[0.625rem] placeholder:text-muted-foreground"
				bind:value={searchQuery}
			/>
			{#if activeFilterCount > 0}
				<button
					type="button"
					class="font-mono text-[0.625rem] text-muted-foreground underline-offset-2 hover:underline"
					onclick={clearFilters}>Clear</button
				>
			{/if}
			<button
				type="button"
				class="rounded border px-2 py-0.5 font-mono text-[0.625rem] font-semibold text-muted-foreground hover:text-foreground"
			>
				CSV
			</button>
		</div>
	</div>

	<!-- Heatmap table -->
	<div class="flex-1 overflow-auto">
		<table class="w-full border-collapse text-xs">
			<thead class="sticky top-0 z-10">
				<!-- Column compliance sub-header -->
				<tr class="bg-card">
					<th
						colspan="3"
						class="border-b border-r px-2 py-1 text-left font-mono text-[0.5625rem] font-semibold uppercase tracking-widest text-muted-foreground"
					>
						{filtered.length} personnel · sorted by readiness ↑
					</th>
					{#each trainingTypes as tt (tt.id)}
						{@const pct = computeColCompliance(tt.id)}
						<th
							class="border-b px-1 py-1 text-center transition-colors {hoveredType === tt.id ? 'bg-muted' : ''}"
							onmouseenter={() => (hoveredType = tt.id)}
							onmouseleave={() => (hoveredType = null)}
						>
							<div class="font-mono text-[0.5625rem] font-semibold uppercase tracking-wider text-muted-foreground">
								{tt.name.length > 8 ? tt.name.slice(0, 8) + '…' : tt.name}
							</div>
							<div class="mt-0.5 font-mono text-[0.625rem] font-bold {readinessTone(pct)}">{pct}%</div>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each sorted.slice(0, 40) as person (person.id)}
					<tr
						class="transition-colors {hoveredPerson === person.id ? 'bg-muted/30' : ''}"
						onmouseenter={() => (hoveredPerson = person.id)}
						onmouseleave={() => (hoveredPerson = null)}
					>
						<td class="sticky left-0 z-[5] border-r bg-card px-2 py-1">
							<div class="flex items-center gap-1.5">
								<span
									class="inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[0.5rem] font-bold {readinessBg(
										person.readiness
									)} {readinessTone(person.readiness)}">{person.readiness}</span
								>
								<span class="font-medium text-foreground">{person.name}</span>
							</div>
						</td>
						<td class="border-r px-2 py-1 font-mono text-[0.625rem] text-muted-foreground">{person.rank}</td>
						<td class="border-r px-2 py-1 text-[0.625rem] text-muted-foreground">{person.group}</td>
						{#each trainingTypes as tt (tt.id)}
							{@const cell = person.trainings[tt.id]}
							<td
								class="px-0.5 py-0.5 text-center transition-colors {hoveredType === tt.id
									? 'ring-1 ring-inset ring-border'
									: ''}"
							>
								{#if cell}
									<div
										class="flex h-full min-h-6 items-center justify-center rounded-sm {cellBg(
											cell.status,
											tt.id,
											person.id
										)}"
										title="{tt.name}: {statusLabels[cell.status]}{cell.date ? ` (${cell.date})` : ''}"
									>
										{#if cell.status === 'expired'}
											<span class="font-mono text-[0.5rem] font-bold text-danger-foreground">EXP</span>
										{:else if cell.status === 'warning-orange'}
											<span class="font-mono text-[0.5rem] font-bold text-warning-foreground">30d</span>
										{:else if cell.status === 'warning-yellow'}
											<span class="font-mono text-[0.5rem] text-warning-foreground">60d</span>
										{:else if cell.status === 'not-completed'}
											<span class="font-mono text-[0.5rem] text-muted-foreground">—</span>
										{:else}
											<span class="font-mono text-[0.5rem] text-success-foreground">✓</span>
										{/if}
									</div>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
		{#if sorted.length > 40}
			<div class="border-t px-4 py-2 text-center font-mono text-xs text-muted-foreground">
				Showing 40 of {sorted.length}
			</div>
		{/if}
	</div>

	<!-- Legend bar -->
	<div class="flex items-center gap-4 border-t bg-card px-4 py-1.5">
		<span class="font-mono text-[0.5625rem] font-semibold uppercase tracking-widest text-muted-foreground">Legend</span>
		{#each [['current', '✓', 'Current'], ['warning-yellow', '60d', 'Expiring 60d'], ['warning-orange', '30d', 'Expiring 30d'], ['expired', 'EXP', 'Expired'], ['not-completed', '—', 'Not Done']] as [status, symbol, label] (status)}
			<div class="flex items-center gap-1.5">
				<span
					class="inline-flex size-5 items-center justify-center rounded-sm {cellBgMap[
						status as TrainingStatus
					]} font-mono text-[0.5rem]">{symbol}</span
				>
				<span class="font-mono text-[0.5625rem] text-muted-foreground">{label}</span>
			</div>
		{/each}
	</div>
</div>
