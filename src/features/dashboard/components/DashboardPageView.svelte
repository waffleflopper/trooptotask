<script lang="ts">
	import { tick, type Component, type Snippet } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { AttentionActionRowSkeleton } from '$lib/components/patterns/readiness-items';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { WorkspaceToolbar, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import { showSubGroups, showSubGroupsToggle } from '$lib/stores/showSubGroups.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatDashboardTitleDate, type DashboardViewerDay } from '../contracts';
	import { openCalendarAt } from '../calendarLink';
	import type { DashboardPageUpdates } from '../dashboardPageUpdates';
	import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
	import {
		composeDashboardSections,
		type DashboardSection,
		type QuickAddDialogProps,
		type QuickAddEntry
	} from '../sections/dashboardSections';
	import { seesCalendar, type DashboardAccess } from '../sections/dashboardAccess';
	import BottomLine from './BottomLine.svelte';
	import ForecastLaneLegend from './ForecastLaneLegend.svelte';
	import ForecastLanes from './ForecastLanes.svelte';
	import GroupStrength from './GroupStrength.svelte';
	import { FORECAST_HEIGHT_VARIABLE, readForecastHeight, rememberForecastHeight } from '../forecastHeightHint';
	import { getBrowserLocalStorage } from '$lib/utils/browserStorage';
	import NeedsYouQueue from './NeedsYouQueue.svelte';
	import ReadinessColumn from './ReadinessColumn.svelte';
	import SetupHints from './SetupHints.svelte';
	import { SetupHintDismissals } from '../setupHintDismissals.svelte';
	import StrengthForecast from './StrengthForecast.svelte';

	interface Props {
		orgName: string;
		/** The Organization's URL segment (an id or a slug), which keys the forecast height the head script also reads. */
		orgSegment?: string;
		viewerDay: DashboardViewerDay;
		/** Null until the workspace and the summary, or its failure, have arrived. */
		ctx: DashboardScreenModel | null;
		/** Every section the page can show; those whose feature is off add nothing. */
		sections: readonly DashboardSection[];
		access: DashboardAccess;
		updates: DashboardPageUpdates;
		/** Offered once above the bands when a summary source failed; the bands that do not need it stay. */
		summaryFailure?: Snippet;
	}

	let { orgName, orgSegment, viewerDay, ctx, sections, access, updates, summaryFailure }: Props = $props();

	const ready = $derived(ctx !== null && !ctx.isHydrating);
	const model = $derived(ready ? ctx : null);
	const eyebrow = $derived(
		model ? `Dashboard · ${orgName} · ${model.totalPersonnel} personnel` : `Dashboard · ${orgName}`
	);
	const parts = $derived(
		model ? composeDashboardSections(sections, model.inputs, model.data.disabledFeatures, access) : null
	);
	const needsYouCount = $derived(
		(parts?.needsYou.ranked.length ?? 0) +
			(parts?.needsYouLoads.reduce((sum, load) => sum + (load.state === 'partial' ? load.unlisted : 0), 0) ?? 0)
	);
	const quickAdd = $derived(parts?.quickAdd ?? []);
	const filledQuickAdd = $derived(quickAdd.findLast((entry) => entry.primary));
	const columnFailed = $derived(parts?.readinessColumns.some((column) => column.state === 'failed') ?? false);
	const hintDismissals = new SetupHintDismissals(() => ({
		orgId: model?.data.orgId ?? '',
		userId: model?.data.userId ?? ''
	}));
	const setupHints = $derived(parts ? hintDismissals.visible(parts.setupHints) : []);
	// With every optional feature off or not set up, Readiness has nothing to say.
	const showsReadiness = $derived(!parts || parts.readinessColumns.length > 0 || setupHints.length > 0);
	const showsOnDuty = $derived(!parts || parts.onDutyBlocks.length > 0);
	/** Withheld or empty data would read as everyone available, so the band says why it is blank instead. */
	const strengthNote = $derived(
		!model
			? null
			: !seesCalendar(access)
				? 'You do not have access to Calendar availability, so strength is not shown.'
				: model.strength.bottomLine.assigned === 0
					? 'No active personnel yet. Strength shows here once people are on the roster.'
					: null
	);

	// The skeleton reserves the forecast column's last height on this device, so lanes and Group rows arriving with the
	// data do not push the bands below them down.
	let forecast = $state<HTMLElement>();
	let rememberedForecast = '';

	$effect(() => {
		if (!orgSegment) return;
		const height = readForecastHeight(getBrowserLocalStorage(), orgSegment, showSubGroups.current);
		if (height) document.documentElement.style.setProperty(FORECAST_HEIGHT_VARIABLE, `${height}px`);
		else document.documentElement.style.removeProperty(FORECAST_HEIGHT_VARIABLE);
	});
	// Once per Organization and choice, so opening a Group or "All N groups" does not teach the next load a taller column.
	$effect(() => {
		const key = `${orgSegment}:${showSubGroups.current}`;
		if (!orgSegment || !model || rememberedForecast === key) return;
		// Effects run after the DOM update, so this reads the column as rendered for the current choice.
		const height = forecast?.getBoundingClientRect().height ?? 0;
		if (height <= 0) return;
		rememberForecastHeight(getBrowserLocalStorage(), orgSegment, showSubGroups.current, height);
		rememberedForecast = key;
	});

	// The last hint can take the Readiness band with it when no column is left.
	async function focusAfterHints() {
		await tick();
		(document.getElementById('dashboard-readiness') ?? document.getElementById('dashboard-needs-you'))?.focus();
	}

	let QuickAddDialog = $state.raw<Component<QuickAddDialogProps> | null>(null);
	let latestOpen = 0;

	// An Organization switch unloads the model; the open or loading dialog belongs to the old one.
	$effect(() => {
		if (model) return;
		QuickAddDialog = null;
		latestOpen++;
	});

	async function openQuickAdd(entry: QuickAddEntry) {
		const request = ++latestOpen;
		const openedIn = model?.data.orgId;
		const current = () => request === latestOpen && model?.data.orgId === openedIn;
		try {
			const { default: dialog } = await entry.loadDialog();
			if (current()) QuickAddDialog = dialog;
		} catch {
			if (current()) toastStore.error(`Could not open ${entry.label}. Try again.`);
		}
	}

	const strengthDisplayItems = $derived<ToolbarItem[]>([
		{
			kind: 'action',
			id: 'group-strength-display',
			label: 'Display',
			icon: 'sliders',
			menuItems: [showSubGroupsToggle()]
		}
	]);
	const EYEBROW = 'font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase';
	const BAND = 'grid grid-cols-[minmax(0,1fr)] border-t-2 border-foreground pt-6';
	const LEDGER = 'grid gap-x-7 gap-y-9 sm:grid-cols-2 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none lg:gap-0';
	const LEDGER_COLUMN = 'min-w-0 lg:border-l lg:border-border lg:px-7 lg:first:border-l-0 lg:first:pl-0';
</script>

<svelte:head>
	<title>{orgName} — Dashboard — Troop to Task</title>
</svelte:head>

{#snippet quickAddButtons()}
	<div class="flex flex-wrap items-center gap-2 pb-1" role="group" aria-labelledby="dashboard-quick-add">
		<span id="dashboard-quick-add" class="pr-1.5 {EYEBROW}">Quick add</span>
		{#each quickAdd as entry (entry.id)}
			<Button variant={entry === filledQuickAdd ? 'default' : 'outline'} onclick={() => openQuickAdd(entry)}>
				<entry.icon data-icon="inline-start" aria-hidden="true" />
				{entry.label}
			</Button>
		{/each}
	</div>
{/snippet}

<div class="flex h-full flex-col">
	<div class="flex-1 overflow-y-auto">
		<div class="px-4 pt-6 pb-5 sm:px-9 sm:pt-8">
			<PageShell.Header
				variant="display"
				{eyebrow}
				title={formatDashboardTitleDate(viewerDay.date)}
				aside={quickAdd.length > 0 ? quickAddButtons : undefined}
			/>
		</div>

		<div class="@container/dashboard grid gap-11 px-4 pt-2 pb-12 sm:px-9">
			{#if !model}
				<p class="sr-only" role="status">Loading Dashboard</p>
			{:else if columnFailed}
				{@render summaryFailure?.()}
			{/if}

			{#if strengthNote}
				<section class="{BAND} gap-[18px]" aria-label="Strength" data-dashboard-band="strength">
					<h2 class={EYEBROW}>Bottom line · Today</h2>
					<p class="text-sm text-muted-foreground">{strengthNote}</p>
				</section>
			{:else}
				<section
					class="{BAND} gap-14 @min-[936px]/dashboard:grid-cols-[400px_minmax(0,1fr)]"
					aria-label="Strength"
					aria-busy={!model}
					data-dashboard-band="strength"
				>
					<div class="grid min-w-0 content-start gap-[18px]">
						<h2 class={EYEBROW}>Bottom line · Today</h2>
						{#if model}
							<BottomLine line={model.strength.bottomLine} statusById={model.strength.statusById} />
						{:else}
							<div class="grid gap-[18px]" aria-hidden="true">
								<div class="flex items-end gap-4">
									<Skeleton class="h-24 w-28" />
									<div class="grid gap-2 pb-1">
										<Skeleton class="h-7 w-16" />
										<Skeleton class="h-3 w-28" />
									</div>
								</div>
								<Skeleton class="h-5 w-full" />
								<div class="grid">
									{#each { length: 4 }, index (index)}
										<div class="flex h-9 items-center gap-2.5 border-b border-border">
											<Skeleton class="size-2.5" />
											<Skeleton class="h-3.5 w-16" />
											<Skeleton class="h-3.5 flex-1" />
											<Skeleton class="h-3 w-20" />
										</div>
									{/each}
								</div>
								<Skeleton class="h-4 w-[80%]" />
							</div>
						{/if}
					</div>
					<div class="grid min-w-0 content-start gap-[18px]">
						<div class="relative">
							<h2 class={EYEBROW}>Available · next 14 days</h2>
							{#if model?.strength.groups.hasSubGroups}
								<!-- Out of flow, so the switch arriving with the data moves nothing. -->
								<div class="absolute top-1/2 right-0 -translate-y-1/2">
									<WorkspaceToolbar ariaLabel="Group strength display" bare items={strengthDisplayItems} />
								</div>
							{/if}
						</div>
						{#if model && parts}
							<div class="grid gap-[18px]" bind:this={forecast}>
								<StrengthForecast
									band={model.strength}
									today={model.today}
									calendarHref="/org/{model.data.orgId}/calendar"
									onOpenCalendar={() => openCalendarAt(model.today)}
								>
									{#snippet lanes()}
										<ForecastLanes days={model.forecastDays} lanes={parts.forecastLanes} {updates} />
									{/snippet}
									{#snippet laneLegend()}
										<ForecastLaneLegend lanes={parts.forecastLanes} />
									{/snippet}
								</StrengthForecast>
								{#if model.strength.groups.sets.length > 0}
									<GroupStrength groups={model.strength.groups} mode={model.strength.bottomLine.mode} />
								{/if}
							</div>
						{:else}
							<div
								class="grid content-start gap-[18px]"
								style:min-height="var({FORECAST_HEIGHT_VARIABLE}, 0px)"
								aria-hidden="true"
							>
								<Skeleton class="h-7 w-[60%]" />
								<div class="grid grid-cols-14 items-end gap-1.5 border-b border-border">
									{#each { length: 14 }, index (index)}
										<div class="grid gap-1.5 px-1.5 pt-2">
											<Skeleton class="mx-auto h-5 w-5" />
											<Skeleton class="h-[131px] w-full rounded-[1px]" />
										</div>
									{/each}
								</div>
								<div class="grid grid-cols-4 gap-4 border-t border-border pt-3.5">
									{#each { length: 4 }, index (index)}
										<Skeleton class="h-4 w-20" />
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</section>
			{/if}

			<section
				class={[BAND, 'gap-14', showsOnDuty && 'lg:grid-cols-[minmax(0,1fr)_340px]']}
				aria-label="Action"
				aria-busy={!model}
				data-dashboard-band="action"
			>
				<div class="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
					<PageShell.SectionHeader
						id="dashboard-needs-you"
						tabindex={-1}
						size="compact"
						eyebrow={parts ? `Needs you · ${needsYouCount}` : 'Needs you'}
						title="Most urgent first"
					>
						{#snippet action()}
							<p class="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">Act here, or open the page</p>
						{/snippet}
					</PageShell.SectionHeader>
					{#if parts && model}
						<NeedsYouQueue
							queue={parts.needsYou}
							{model}
							{access}
							{updates}
							unavailable={parts.needsYouUnavailable}
							loads={parts.needsYouLoads}
						/>
					{:else}
						<div class="grid border-t border-foreground" aria-hidden="true">
							{#each { length: 5 }, index (index)}
								<AttentionActionRowSkeleton />
							{/each}
						</div>
					{/if}
				</div>
				{#if showsOnDuty}
					<div class="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
						<PageShell.SectionHeader size="compact" eyebrow="On duty" title="Tonight and tomorrow" />
						{#if model && parts}
							{#each parts.onDutyBlocks as block (block.id)}
								<block.component {model} />
							{/each}
						{:else}
							<div class="grid gap-[18px]" aria-hidden="true">
								<div class="grid border-t border-border">
									{#each { length: 3 }, index (index)}
										<div class="flex h-11 items-center gap-3 border-b border-border">
											<Skeleton class="h-3 flex-1" />
											<Skeleton class="h-3.5 w-24" />
											<Skeleton class="h-3.5 w-24" />
										</div>
									{/each}
								</div>
								<div class="grid border-t border-border">
									{#each { length: 4 }, index (index)}
										<div class="flex h-[38px] items-center gap-2.5 border-b border-border">
											<Skeleton class="h-3 w-12" />
											<Skeleton class="h-3.5 flex-1" />
											<Skeleton class="h-3.5 w-16" />
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</section>

			{#if showsReadiness}
				<section class="{BAND} gap-5" aria-label="Readiness" aria-busy={!model} data-dashboard-band="readiness">
					<PageShell.SectionHeader
						id="dashboard-readiness"
						tabindex={-1}
						size="compact"
						eyebrow="Readiness · as of today"
						title="Where the unit stands"
					/>
					{#if parts}
						{#if parts.readinessColumns.length > 0}
							<ul class={LEDGER} aria-label="Readiness by feature">
								{#each parts.readinessColumns as column (column.id)}
									<li class={LEDGER_COLUMN}><ReadinessColumn {column} /></li>
								{/each}
							</ul>
						{/if}
						<SetupHints
							hints={setupHints}
							onDismiss={(feature) => hintDismissals.dismiss(feature)}
							onEmptied={focusAfterHints}
						/>
					{:else}
						<div class={LEDGER} aria-hidden="true">
							{#each { length: 4 }, index (index)}
								<div class="grid content-start gap-3 {LEDGER_COLUMN}">
									<Skeleton class="h-3.5 w-28" />
									<div class="flex items-end gap-2">
										<Skeleton class="h-[50px] w-24" />
										<Skeleton class="mb-0.5 h-3 w-14" />
									</div>
									<Skeleton class="h-2 w-full" />
									<div class="grid gap-1.5 py-0.5">
										<Skeleton class="h-3.5 w-full" />
										<Skeleton class="h-3.5 w-[70%]" />
									</div>
									<Skeleton class="h-3.5 w-24" />
								</div>
							{/each}
						</div>
					{/if}
				</section>
			{/if}
		</div>
	</div>
</div>

{#if QuickAddDialog && model}
	<QuickAddDialog {model} {access} {updates} onClose={() => (QuickAddDialog = null)} />
{/if}
