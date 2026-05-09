<script lang="ts">
	import { page } from '$app/state';
	import { ArrowRight, BadgeCheck, CalendarDays, Circle, Grid2X2, Info, ShieldAlert } from '@lucide/svelte';
	import PrototypeSwitcher from '$lib/components/prototype/PrototypeSwitcher.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix/index.js';
	import type { OperationalMatrixColumn, OperationalMatrixRow } from '$lib/components/ui/operational-matrix/index.js';

	type VariantKey = 'A' | 'B' | 'C';
	type RequirementStatus =
		| 'current'
		| 'due-soon'
		| 'critical-due-soon'
		| 'expired'
		| 'missing'
		| 'not-required'
		| 'exempt';
	type RequirementTone = 'success' | 'warning' | 'critical' | 'danger' | 'neutral' | 'muted' | 'info';
	type SourceDomain = 'Training' | 'Critical Tasks' | 'Calendar';

	interface RequirementVisual {
		status: RequirementStatus;
		label: string;
		shortLabel: string;
		tone: RequirementTone;
		description: string;
		trainingSource?: string;
		criticalTasksSource?: string;
	}

	interface PersonRow extends OperationalMatrixRow {
		rank: string;
		group: string;
		readiness: number;
	}

	interface RequirementColumn extends OperationalMatrixColumn {
		family: 'Annual Training' | 'Weapons' | 'Critical Tasks';
		short: string;
	}

	interface SourceStatus {
		domain: SourceDomain;
		source: string;
		mapped?: RequirementStatus;
		targetLabel?: string;
		explanation: string;
	}

	const variants = [
		{ key: 'A', name: 'Shared vocabulary' },
		{ key: 'B', name: 'Domain wrappers' },
		{ key: 'C', name: 'Token contract' }
	];

	const requirementVisuals: RequirementVisual[] = [
		{
			status: 'current',
			label: 'Current',
			shortLabel: 'Current',
			tone: 'success',
			description: 'Complete and outside the warning window.',
			trainingSource: 'current',
			criticalTasksSource: 'current'
		},
		{
			status: 'due-soon',
			label: 'Due Soon',
			shortLabel: 'Soon',
			tone: 'warning',
			description: 'Inside the outer warning window.',
			trainingSource: 'warning-yellow',
			criticalTasksSource: 'expiring-soon'
		},
		{
			status: 'critical-due-soon',
			label: 'Critical Due Soon',
			shortLabel: 'Critical',
			tone: 'critical',
			description: 'Training-only inner warning window.',
			trainingSource: 'warning-orange'
		},
		{
			status: 'expired',
			label: 'Expired',
			shortLabel: 'Expired',
			tone: 'danger',
			description: 'Past expiration date.',
			trainingSource: 'expired',
			criticalTasksSource: 'expired'
		},
		{
			status: 'missing',
			label: 'Missing',
			shortLabel: 'Missing',
			tone: 'neutral',
			description: 'Required, but no completion is recorded.',
			trainingSource: 'not-completed',
			criticalTasksSource: 'not-recorded'
		},
		{
			status: 'not-required',
			label: 'Not Required',
			shortLabel: 'N/R',
			tone: 'muted',
			description: 'Requirement does not apply to this person.',
			trainingSource: 'not-required',
			criticalTasksSource: 'not applicable by MOS'
		},
		{
			status: 'exempt',
			label: 'Exempt',
			shortLabel: 'Exempt',
			tone: 'info',
			description: 'Explicitly exempted from a requirement.',
			trainingSource: 'exempt'
		}
	];

	const sourceStatuses: SourceStatus[] = [
		{
			domain: 'Training',
			source: 'warning-yellow',
			mapped: 'due-soon',
			explanation: 'Outer threshold from each training type, often 60 days.'
		},
		{
			domain: 'Training',
			source: 'warning-orange',
			mapped: 'critical-due-soon',
			explanation: 'Inner threshold from each training type, often 30 days.'
		},
		{
			domain: 'Critical Tasks',
			source: 'expiring-soon',
			mapped: 'due-soon',
			explanation: 'Single warning threshold from organization Critical Tasks settings.'
		},
		{
			domain: 'Critical Tasks',
			source: 'not-recorded',
			mapped: 'missing',
			explanation: 'Same requirement meaning as Training not-completed.'
		},
		{
			domain: 'Calendar',
			source: 'statusType',
			targetLabel: 'CalendarStatusBadge',
			explanation: 'Should not map into requirement badges; use CalendarStatusBadge instead.'
		}
	];

	const rows: PersonRow[] = [
		{ id: 'brooks', label: 'Brooks, Avery', rank: '1LT', group: 'HQ', readiness: 92 },
		{ id: 'chen', label: 'Chen, Maya', rank: 'SFC', group: 'A Co', readiness: 86 },
		{ id: 'ortiz', label: 'Ortiz, Sam', rank: 'SSG', group: 'A Co', readiness: 61 },
		{ id: 'price', label: 'Price, Morgan', rank: 'SPC', group: 'B Co', readiness: 78 }
	];

	const columns: RequirementColumn[] = [
		{ id: 'cyber', label: 'Cyber Awareness', family: 'Annual Training', short: 'Cyber' },
		{ id: 'sharp', label: 'SHARP', family: 'Annual Training', short: 'SHARP' },
		{ id: 'rifle', label: 'Rifle Qualification', family: 'Weapons', short: 'Rifle' },
		{ id: 'cpr', label: 'CPR', family: 'Annual Training', short: 'CPR' },
		{ id: 'task-1', label: '181-105-1001', family: 'Critical Tasks', short: 'ICT 1' },
		{ id: 'task-2', label: '181-105-1002', family: 'Critical Tasks', short: 'ICT 2' }
	];

	const matrixStatuses: Record<string, Record<string, RequirementStatus>> = {
		brooks: {
			cyber: 'current',
			sharp: 'current',
			rifle: 'due-soon',
			cpr: 'current',
			'task-1': 'current',
			'task-2': 'due-soon'
		},
		chen: {
			cyber: 'current',
			sharp: 'due-soon',
			rifle: 'current',
			cpr: 'exempt',
			'task-1': 'current',
			'task-2': 'missing'
		},
		ortiz: {
			cyber: 'current',
			sharp: 'critical-due-soon',
			rifle: 'expired',
			cpr: 'missing',
			'task-1': 'expired',
			'task-2': 'not-required'
		},
		price: {
			cyber: 'due-soon',
			sharp: 'current',
			rifle: 'current',
			cpr: 'missing',
			'task-1': 'current',
			'task-2': 'current'
		}
	};

	const columnGroups = [
		{ id: 'training', label: 'Training', columnSpan: 4 },
		{ id: 'critical-tasks', label: 'Critical Tasks', columnSpan: 2 }
	];

	const currentVariant = $derived(resolveVariant(page.url.searchParams.get('variant')));

	function resolveVariant(value: string | null): VariantKey {
		if (value === 'B' || value === 'C') return value;
		return 'A';
	}

	function visualFor(status: RequirementStatus): RequirementVisual {
		return requirementVisuals.find((visual) => visual.status === status) ?? requirementVisuals[0]!;
	}

	function cellStatus(row: PersonRow, column: RequirementColumn): RequirementStatus {
		return matrixStatuses[row.id]?.[column.id] ?? 'missing';
	}

	function badgeToneClass(tone: RequirementTone): string {
		const classes: Record<RequirementTone, string> = {
			success: 'border-emerald-700/20 bg-emerald-600 text-white',
			warning: 'border-amber-500/25 bg-amber-100 text-amber-950',
			critical: 'border-warning/35 bg-warning text-background',
			danger: 'border-red-700/25 bg-red-600 text-white',
			neutral: 'border-border bg-muted text-muted-foreground',
			muted: 'border-border bg-background text-muted-foreground',
			info: 'border-sky-700/20 bg-sky-600 text-white'
		};
		return classes[tone];
	}

	function cellToneClass(tone: RequirementTone): string {
		const classes: Record<RequirementTone, string> = {
			success: 'bg-emerald-600/15 text-emerald-950 ring-1 ring-inset ring-emerald-700/25',
			warning: 'bg-amber-400/20 text-amber-950 ring-1 ring-inset ring-amber-600/25',
			critical: 'bg-warning text-background ring-1 ring-inset ring-warning/35',
			danger: 'bg-red-600/15 text-red-950 ring-1 ring-inset ring-red-700/25',
			neutral: 'bg-muted text-muted-foreground ring-1 ring-inset ring-border',
			muted: 'bg-background text-muted-foreground ring-1 ring-inset ring-border',
			info: 'bg-sky-600/15 text-sky-950 ring-1 ring-inset ring-sky-700/25'
		};
		return classes[tone];
	}

	function domainBadgeClass(domain: SourceDomain): string {
		if (domain === 'Training') return 'border-blue-700/20 bg-blue-50 text-blue-950';
		if (domain === 'Critical Tasks') return 'border-violet-700/20 bg-violet-50 text-violet-950';
		return 'border-emerald-700/20 bg-emerald-50 text-emerald-950';
	}
</script>

<svelte:head>
	<title>Requirement Badge Prototype | TroopToTask</title>
</svelte:head>

<main class="min-h-screen bg-background p-6 pb-28 text-foreground md:p-10">
	<div class="mx-auto grid max-w-7xl gap-8">
		<header class="grid gap-3">
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="outline">Prototype</Badge>
				<Badge variant="secondary">Throwaway</Badge>
			</div>
			<div class="grid gap-2">
				<h1 class="text-3xl font-bold tracking-tight">Requirement badge model</h1>
				<p class="max-w-4xl text-sm text-muted-foreground">
					Three variants for separating calendar status colors from requirement currency while making Training and
					Critical Tasks visually congruent.
				</p>
			</div>
		</header>

		{#if currentVariant === 'A'}
			{@render VariantA()}
		{:else if currentVariant === 'B'}
			{@render VariantB()}
		{:else}
			{@render VariantC()}
		{/if}
	</div>
</main>

<PrototypeSwitcher {variants} current={currentVariant} />

{#snippet RequirementBadge(status: RequirementStatus)}
	{@const visual = visualFor(status)}
	<Badge variant="outline" class={badgeToneClass(visual.tone)}>{visual.label}</Badge>
{/snippet}

{#snippet MatrixCell(status: RequirementStatus, compact = false)}
	{@const visual = visualFor(status)}
	<span
		class={`flex h-full min-h-11 items-center justify-center px-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.04em] ${cellToneClass(visual.tone)}`}
	>
		{compact ? visual.shortLabel : visual.label}
	</span>
{/snippet}

{#snippet MatrixPreview(showLegend = true, compact = false)}
	<div class="grid gap-3 rounded-lg border bg-card p-4">
		{#if showLegend}
			<div class="flex flex-wrap gap-2" aria-label="Requirement status legend">
				{#each requirementVisuals as visual (visual.status)}
					{@render RequirementBadge(visual.status)}
				{/each}
			</div>
		{/if}

		<OperationalMatrix.Root {rows} {columns}>
			<OperationalMatrix.Viewport
				ariaLabel="Requirement badge prototype matrix viewport"
				maxHeight="28rem"
				class="rounded-md border bg-card"
			>
				<OperationalMatrix.Table
					ariaLabel="Requirement badge prototype matrix"
					class="min-w-[62rem] table-fixed text-sm [&_[data-matrix-cell]]:h-12 [&_[data-matrix-cell]]:border [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0 [&_[data-matrix-column-header]]:border [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted/70 [&_[data-slot=operational-matrix-cell-content]]:flex [&_[data-slot=operational-matrix-cell-content]]:h-12 [&_[data-slot=operational-matrix-cell-content]]:w-full"
				>
					<colgroup>
						<col class="w-60" />
						{#each columns as column (column.id)}
							<col class="w-28" />
						{/each}
					</colgroup>
					<OperationalMatrix.Header>
						<OperationalMatrix.HeaderRow>
							<OperationalMatrix.CornerCell rowSpan={2} sticky class="sticky left-0 top-0 z-30 bg-muted px-4 text-left">
								Personnel
							</OperationalMatrix.CornerCell>
							{#each columnGroups as group (group.id)}
								<OperationalMatrix.ColumnGroup
									label={group.label}
									columnSpan={group.columnSpan}
									sticky
									class="sticky top-0 z-20 h-8 bg-muted px-3 text-left text-xs font-medium"
								/>
							{/each}
						</OperationalMatrix.HeaderRow>
						<OperationalMatrix.HeaderRow>
							{#each columns as column (column.id)}
								<OperationalMatrix.ColumnHeader
									{column}
									sticky
									class="sticky top-8 z-20 h-14 bg-muted px-2 text-center"
								>
									<span class="grid gap-1">
										<span class="font-mono text-[10px] uppercase text-muted-foreground">{column.family}</span>
										<span class="text-xs font-semibold">{column.short}</span>
									</span>
								</OperationalMatrix.ColumnHeader>
							{/each}
						</OperationalMatrix.HeaderRow>
					</OperationalMatrix.Header>
					<OperationalMatrix.Body>
						{#each rows as row (row.id)}
							<OperationalMatrix.Row {row} class="bg-card">
								<OperationalMatrix.RowHeader {row} sticky class="sticky left-0 z-10 border bg-card px-4 py-2 text-left">
									<span class="grid gap-1">
										<span><span class="font-mono text-xs text-amber-700">{row.rank}</span> {row.label}</span>
										<span class="font-mono text-[10px] uppercase text-muted-foreground"
											>{row.group} - {row.readiness}%</span
										>
									</span>
								</OperationalMatrix.RowHeader>
								{#each columns as column (column.id)}
									{@const status = cellStatus(row, column)}
									<OperationalMatrix.Cell
										{row}
										{column}
										ariaLabel={`${row.label}, ${column.label}, ${visualFor(status).label}`}
									>
										{@render MatrixCell(status, compact)}
									</OperationalMatrix.Cell>
								{/each}
							</OperationalMatrix.Row>
						{/each}
					</OperationalMatrix.Body>
				</OperationalMatrix.Table>
			</OperationalMatrix.Viewport>
		</OperationalMatrix.Root>
	</div>
{/snippet}

{#snippet VariantA()}
	<section class="grid gap-6" aria-labelledby="variant-a-title">
		<div class="grid gap-2">
			<h2 id="variant-a-title" class="text-2xl font-semibold tracking-tight">A. One shared requirement vocabulary</h2>
			<p class="max-w-4xl text-sm text-muted-foreground">
				A single `RequirementStatusBadge` owns all requirement currency labels. Training and Critical Tasks map their
				computed status into this vocabulary before rendering.
			</p>
		</div>

		<div class="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
			<div class="grid gap-3 rounded-lg border bg-card p-4">
				<h3 class="text-sm font-medium">Proposed statuses</h3>
				<div class="grid gap-3">
					{#each requirementVisuals as visual (visual.status)}
						<div class="grid grid-cols-[10rem_1fr] items-start gap-3 rounded-md border p-3">
							{@render RequirementBadge(visual.status)}
							<p class="text-sm text-muted-foreground">{visual.description}</p>
						</div>
					{/each}
				</div>
			</div>

			{@render MatrixPreview(true)}
		</div>
	</section>
{/snippet}

{#snippet VariantB()}
	<section class="grid gap-6" aria-labelledby="variant-b-title">
		<div class="grid gap-2">
			<h2 id="variant-b-title" class="text-2xl font-semibold tracking-tight">B. Domain wrappers over shared tones</h2>
			<p class="max-w-4xl text-sm text-muted-foreground">
				Training and Critical Tasks keep their own source status names, but wrappers map them into the same approved
				tones. This keeps the two-warning-zone training model visible.
			</p>
		</div>

		<div class="grid gap-4 lg:grid-cols-3">
			<div class="grid gap-3 rounded-lg border bg-card p-4">
				<div class="flex items-center gap-2">
					<BadgeCheck class="size-4 text-muted-foreground" />
					<h3 class="text-sm font-medium">TrainingStatusBadge</h3>
				</div>
				<div class="grid gap-2">
					{@render RequirementBadge('current')}
					{@render RequirementBadge('due-soon')}
					{@render RequirementBadge('critical-due-soon')}
					{@render RequirementBadge('expired')}
					{@render RequirementBadge('missing')}
					{@render RequirementBadge('not-required')}
					{@render RequirementBadge('exempt')}
				</div>
				<p class="text-sm text-muted-foreground">
					Training owns the threshold math: yellow and orange remain separate source states.
				</p>
			</div>

			<div class="grid gap-3 rounded-lg border bg-card p-4">
				<div class="flex items-center gap-2">
					<ShieldAlert class="size-4 text-muted-foreground" />
					<h3 class="text-sm font-medium">CriticalTaskStatusBadge</h3>
				</div>
				<div class="grid gap-2">
					{@render RequirementBadge('current')}
					{@render RequirementBadge('due-soon')}
					{@render RequirementBadge('expired')}
					{@render RequirementBadge('missing')}
					{@render RequirementBadge('not-required')}
				</div>
				<p class="text-sm text-muted-foreground">
					Critical Tasks has one expiring-soon state today, so it does not render critical-due-soon.
				</p>
			</div>

			<div class="grid gap-3 rounded-lg border bg-card p-4">
				<div class="flex items-center gap-2">
					<CalendarDays class="size-4 text-muted-foreground" />
					<h3 class="text-sm font-medium">CalendarStatusBadge</h3>
				</div>
				<div class="flex flex-wrap gap-2">
					<Badge variant="outline" class="border-[color:#48bd76] bg-[#48bd76] text-white">Leave</Badge>
					<Badge variant="outline" class="border-[color:#469be0] bg-[#469be0] text-white">School</Badge>
					<Badge variant="outline" class="border-[color:#a9562b] bg-[#a9562b] text-white">Field</Badge>
				</div>
				<p class="text-sm text-muted-foreground">
					Calendar remains the only wrapper allowed to render saved status type colors.
				</p>
			</div>
		</div>

		{@render MatrixPreview(true, true)}
	</section>
{/snippet}

{#snippet VariantC()}
	<section class="grid gap-6" aria-labelledby="variant-c-title">
		<div class="grid gap-2">
			<h2 id="variant-c-title" class="text-2xl font-semibold tracking-tight">C. Token contract board</h2>
			<p class="max-w-4xl text-sm text-muted-foreground">
				The shared artifact is a status visual contract. Badges, matrix cells, report dots, and legends consume the same
				`requirementStatusVisuals` map.
			</p>
		</div>

		<div class="grid gap-4">
			<div class="overflow-hidden rounded-lg border bg-card">
				<table class="w-full min-w-[54rem] text-sm">
					<thead class="bg-muted text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
						<tr>
							<th class="px-4 py-3">Status</th>
							<th class="px-4 py-3">Badge</th>
							<th class="px-4 py-3">Matrix cell</th>
							<th class="px-4 py-3">Training source</th>
							<th class="px-4 py-3">Critical Tasks source</th>
						</tr>
					</thead>
					<tbody>
						{#each requirementVisuals as visual (visual.status)}
							<tr class="border-t">
								<th class="px-4 py-3 text-left font-mono text-xs uppercase">{visual.status}</th>
								<td class="px-4 py-3">{@render RequirementBadge(visual.status)}</td>
								<td class="h-14 px-4 py-3">
									<div class="w-40">{@render MatrixCell(visual.status)}</div>
								</td>
								<td class="px-4 py-3 text-muted-foreground">{visual.trainingSource ?? '-'}</td>
								<td class="px-4 py-3 text-muted-foreground">{visual.criticalTasksSource ?? '-'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
				<div class="grid gap-3 rounded-lg border bg-card p-4">
					<h3 class="text-sm font-medium">Source mapping audit</h3>
					<div class="grid gap-2">
						{#each sourceStatuses as source (source.domain + source.source)}
							<div class="grid gap-2 rounded-md border p-3 md:grid-cols-[9rem_10rem_1fr] md:items-center">
								<Badge variant="outline" class={domainBadgeClass(source.domain)}>{source.domain}</Badge>
								<div class="font-mono text-xs">{source.source}</div>
								<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
									<ArrowRight class="size-4" />
									{#if source.mapped}
										{@render RequirementBadge(source.mapped)}
									{:else}
										<Badge variant="outline" class="border-emerald-700/20 bg-emerald-50 text-emerald-950">
											{source.targetLabel ?? 'No requirement mapping'}
										</Badge>
									{/if}
									<span>{source.explanation}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<div class="grid gap-3 rounded-lg border bg-card p-4">
					<h3 class="text-sm font-medium">Decision pressure</h3>
					<div class="grid gap-3 text-sm text-muted-foreground">
						<p class="flex gap-2">
							<Info class="mt-0.5 size-4 shrink-0" /> Does `critical-due-soon` belong globally if only Training has it today?
						</p>
						<p class="flex gap-2">
							<Circle class="mt-0.5 size-4 shrink-0" /> Should `exempt` and `not-required` look different enough in dense
							matrix cells?
						</p>
						<p class="flex gap-2">
							<Grid2X2 class="mt-0.5 size-4 shrink-0" /> Matrix cells may consume the token map without literally rendering
							badges.
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>
{/snippet}
