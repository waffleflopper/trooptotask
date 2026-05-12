<!-- PROTOTYPE Variant B: "Card Grid Intel"
     No table at all. Information is organized as interactive cards — one per training type —
     showing compliance ring, personnel count, and a mini list of who's expired/expiring.
     Top-level: readiness hero + quick-filter pills + card grid.
     Emphasis: training-type-centric view instead of person-centric. -->
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
		statusColorMap,
		readinessTone,
		readinessBarColor,
		readinessBg,
		type TrainingStatus,
		type PersonRow,
		type TrainingTypeSummary
	} from './mockData';

	let filterGroup = $state('');
	let expandedType = $state<string | null>(null);
	let viewMode = $state<'types' | 'groups'>('types');

	const filtered = $derived(filterGroup ? personnel.filter((p) => p.group === filterGroup) : personnel);

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

	function computeGroupStats(groupName: string) {
		const groupPersonnel = personnel.filter((p) => p.group === groupName);
		let totalCurrent = 0;
		let totalApplicable = 0;
		for (const p of groupPersonnel) {
			for (const t of Object.values(p.trainings)) {
				totalApplicable++;
				if (t.status === 'current') totalCurrent++;
			}
		}
		return {
			personnel: groupPersonnel.length,
			readiness: totalApplicable > 0 ? Math.round((totalCurrent / totalApplicable) * 100) : 0
		};
	}

	function ringDasharray(pct: number): string {
		const circumference = 2 * Math.PI * 36;
		const filled = (pct / 100) * circumference;
		return `${filled} ${circumference - filled}`;
	}

	function ringColor(pct: number): string {
		if (pct >= 80) return 'stroke-success';
		if (pct >= 60) return 'stroke-warning';
		return 'stroke-destructive';
	}
</script>

<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 pb-20 md:p-6">
	<!-- Hero bar -->
	<div class="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-4">
			<!-- Compact ring chart -->
			<svg class="size-16 -rotate-90" viewBox="0 0 80 80">
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
				<h1 class="font-display text-2xl font-bold text-foreground">Training Readiness</h1>
				<p class="text-sm text-muted-foreground">
					<span class="font-semibold {readinessTone(overallReadiness)}">{overallReadiness}%</span> across {totalPersonnel}
					personnel
				</p>
			</div>
		</div>
		<div class="flex items-center gap-3">
			<!-- Inline status pills -->
			{#each [['current', statusCounts.current], ['expired', statusCounts.expired], ['warning-orange', statusCounts.warningOrange + statusCounts.warningYellow], ['not-completed', statusCounts.notCompleted]] as [status, count] (status)}
				<div class="flex items-center gap-1.5 rounded-full border px-2.5 py-1">
					<span class="size-2 rounded-full {statusDotMap[status as TrainingStatus]}"></span>
					<span class="font-mono text-[0.625rem] font-semibold text-foreground">{count}</span>
					<span class="font-mono text-[0.625rem] text-muted-foreground">{statusLabels[status as TrainingStatus]}</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- Filter + view toggle row -->
	<div class="flex flex-wrap items-center gap-2">
		<!-- Group filter pills -->
		<button
			type="button"
			class="rounded-full border px-3 py-1 font-mono text-xs font-semibold transition-colors {filterGroup === ''
				? 'border-foreground bg-foreground text-background'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => (filterGroup = '')}
		>
			All
		</button>
		{#each groups as g (g.id)}
			<button
				type="button"
				class="rounded-full border px-3 py-1 font-mono text-xs font-semibold transition-colors {filterGroup === g.name
					? 'border-foreground bg-foreground text-background'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (filterGroup = filterGroup === g.name ? '' : g.name)}
			>
				{g.name}
			</button>
		{/each}

		<div class="flex-1"></div>

		<!-- View toggle -->
		<div class="flex rounded-lg border">
			<button
				type="button"
				class="px-3 py-1 font-mono text-xs font-semibold transition-colors {viewMode === 'types'
					? 'bg-muted text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (viewMode = 'types')}
			>
				By Type
			</button>
			<button
				type="button"
				class="border-l px-3 py-1 font-mono text-xs font-semibold transition-colors {viewMode === 'groups'
					? 'bg-muted text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (viewMode = 'groups')}
			>
				By Group
			</button>
		</div>
	</div>

	{#if viewMode === 'types'}
		<!-- Training type cards grid -->
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
						<!-- Mini ring -->
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

					<!-- Status bar -->
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

					<!-- Expanded detail: who's expired -->
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
	{:else}
		<!-- Groups view -->
		<div class="grid gap-4 sm:grid-cols-2">
			{#each groups as g (g.id)}
				{@const stats = computeGroupStats(g.name)}
				<div class="rounded-lg border bg-card p-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="text-base font-semibold text-foreground">{g.name}</h3>
							<p class="font-mono text-[0.625rem] text-muted-foreground">{stats.personnel} personnel</p>
						</div>
						<svg class="size-14 -rotate-90" viewBox="0 0 80 80">
							<circle cx="40" cy="40" r="36" fill="none" stroke-width="5" class="stroke-muted" />
							<circle
								cx="40"
								cy="40"
								r="36"
								fill="none"
								stroke-width="5"
								stroke-linecap="round"
								class={ringColor(stats.readiness)}
								stroke-dasharray={ringDasharray(stats.readiness)}
							/>
							<text
								x="40"
								y="44"
								text-anchor="middle"
								class="fill-foreground font-mono text-sm font-bold"
								transform="rotate(90 40 40)">{stats.readiness}%</text
							>
						</svg>
					</div>
					<!-- Per-type bars for this group -->
					<div class="mt-3 space-y-1.5">
						{#each trainingTypes as tt (tt.id)}
							{@const groupFiltered = personnel.filter((p) => p.group === g.name)}
							{@const currentCount = groupFiltered.filter((p) => p.trainings[tt.id]?.status === 'current').length}
							{@const pct = groupFiltered.length > 0 ? Math.round((currentCount / groupFiltered.length) * 100) : 0}
							<div class="flex items-center gap-2">
								<span class="w-24 truncate font-mono text-[0.625rem] text-muted-foreground">{tt.name}</span>
								<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
									<div class="h-full rounded-full {readinessBarColor(pct)}" style:width="{pct}%"></div>
								</div>
								<span class="w-8 text-right font-mono text-[0.625rem] {readinessTone(pct)}">{pct}%</span>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
