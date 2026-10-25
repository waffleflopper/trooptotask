<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ActivityRangeMenu from './ActivityRangeMenu.svelte';
	import AdminPager from './AdminPager.svelte';
	import { createAdminUrlSearch } from './adminUrlSearch.svelte';
	import {
		activityDayHeading,
		activityDayKey,
		activityRangeLabel,
		activityRangePresets,
		activitySearchParams,
		groupActivityByDay,
		type ActivityPage,
		type ActivityQuery
	} from '../activityQuery';
	import { describeAuditEvent, type ActivityCategory } from '../auditSentences';

	type ActivityLoader = (query: ActivityQuery, timeZone: string, signal: AbortSignal) => Promise<ActivityPage>;
	type Feed = { status: 'loading' } | { status: 'error' } | { status: 'ready'; page: ActivityPage };

	let {
		query,
		timeZone,
		load,
		today = new Date()
	}: { query: ActivityQuery; timeZone: string; load: ActivityLoader; today?: Date } = $props();

	const CATEGORY_OPTIONS: ReadonlyArray<{ value: 'all' | ActivityCategory; label: string }> = [
		{ value: 'all', label: 'All' },
		{ value: 'access', label: 'Access' },
		{ value: 'accounts', label: 'Accounts' },
		{ value: 'organizations', label: 'Organizations' },
		{ value: 'security', label: 'Security' }
	];
	const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS.map((option) => [option.value, option.label]));
	const SEVERITY_BAR = { info: '', warning: 'bg-warning', critical: 'bg-destructive' } as const;
	const SEVERITY_LABEL = { info: 'Info', warning: 'Warning', critical: 'Critical' } as const;

	let feed = $state<Feed>({ status: 'loading' });
	let attempt = $state(0);
	const key = $derived(activitySearchParams(query).toString());
	const scopeKey = $derived(activitySearchParams({ ...query, page: 1 }).toString());
	// The pager stays mounted while a page loads, so the button that was pressed keeps focus.
	let known = $state<{ scope: string; pages: number } | null>(null);

	// A reply that lands after the filters moved on must not change the screen, so each run aborts its predecessor.
	$effect(() => {
		void key;
		void attempt;
		const controller = new AbortController();
		feed = { status: 'loading' };
		const asked = untrack(() => query);
		load(
			asked,
			untrack(() => timeZone),
			controller.signal
		).then(
			(page) => {
				if (controller.signal.aborted) return;
				feed = { status: 'ready', page };
				known = {
					scope: activitySearchParams({ ...asked, page: 1 }).toString(),
					pages: Math.max(1, Math.ceil(page.totalCount / page.pageSize))
				};
			},
			() => {
				if (!controller.signal.aborted) feed = { status: 'error' };
			}
		);
		return () => controller.abort();
	});

	function href(next: ActivityQuery): string {
		const search = activitySearchParams(next).toString();
		return search ? `${resolve('/admin/activity')}?${search}` : resolve('/admin/activity');
	}

	function navigate(next: Partial<ActivityQuery>, options: { replace?: boolean } = {}) {
		goto(href({ ...query, page: 1, ...next }), { keepFocus: true, noScroll: true, replaceState: options.replace });
	}

	const search = createAdminUrlSearch(
		() => query.q,
		(q) => navigate({ q: q.trim() }, { replace: true })
	);

	const filtered = $derived(Boolean(query.category || query.q || query.from || query.to));
	const pagerPage = $derived(feed.status === 'ready' ? feed.page.page : query.page);
	const pagerPages = $derived(known?.scope === scopeKey ? known.pages : 1);

	function pageHref(page: number): string {
		return href({ ...query, page });
	}

	const timeLabel = $derived(
		new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
	);
	const fullLabel = $derived(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long', timeZone }));
	const todayKey = $derived(activityDayKey(today.toISOString(), timeZone));

	const rangePresets = $derived(activityRangePresets(timeZone, today));
	const rangeLabel = $derived(activityRangeLabel(query, rangePresets, todayKey));
	let start = $derived(query.from);
	let end = $derived(query.to);
	$effect(() => {
		const [chosenStart, chosenEnd] = [start, end];
		untrack(() => {
			if (chosenStart !== query.from || chosenEnd !== query.to) navigate({ from: chosenStart, to: chosenEnd });
		});
	});
</script>

<PageShell.Root width="wide">
	<PageShell.Header
		eyebrow="Platform · Audit log"
		title="Activity"
		variant="display"
		subtitle={`Everything that happened across the platform, newest first. Times are in ${timeZone.replace(/_/g, ' ')}.`}
	/>

	<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
		<div class="w-full min-w-0 sm:w-80">
			<WorkspaceToolbar
				ariaLabel="Activity controls"
				bare
				items={[]}
				search={{
					label: 'Search',
					placeholder: 'Search people, organizations',
					value: search.value,
					onValueChange: search.setValue
				}}
			/>
		</div>
		<SegmentedFilter.Root
			label="Category"
			options={CATEGORY_OPTIONS}
			bind:value={() => query.category ?? 'all', (next) => navigate({ category: next === 'all' ? null : next })}
		/>
		<div class="ml-auto">
			<ActivityRangeMenu label={rangeLabel} presets={rangePresets} {timeZone} bind:start bind:end />
		</div>
	</div>

	<section aria-label="Activity events" aria-busy={feed.status === 'loading'} class="grid min-w-0 gap-6">
		{#if feed.status === 'loading'}
			<div class="grid gap-6" aria-hidden="true" data-testid="activity-skeleton">
				{#each [0, 1] as group (group)}
					<div class="grid">
						<div class="flex items-center justify-between border-b border-foreground/60 pb-2">
							<Skeleton class="h-6 w-40" />
							<Skeleton class="h-4 w-16" />
						</div>
						{#each [0, 1, 2] as row (row)}
							<div
								class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2 border-b py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
							>
								<Skeleton class="order-1 h-4 w-10" />
								<Skeleton class="order-2 h-5 w-20 sm:order-3" />
								<div class="order-3 col-span-2 grid gap-2 sm:order-2 sm:col-span-1">
									<Skeleton class="h-5 w-4/5" />
									<Skeleton class="h-4 w-1/2" />
								</div>
							</div>
						{/each}
					</div>
				{/each}
			</div>
			<p role="status" class="sr-only">Loading activity</p>
		{:else if feed.status === 'error'}
			<Alert.Root variant="destructive">
				<Alert.Title>Unable to load Activity</Alert.Title>
				<Alert.Description>The events could not be loaded. Your filters are unchanged.</Alert.Description>
				<div class="mt-3">
					<Button variant="outline" onclick={() => attempt++}>Retry Activity</Button>
				</div>
			</Alert.Root>
		{:else if feed.page.events.length === 0}
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>{filtered ? 'No activity matches these filters.' : 'No activity yet.'}</Empty.Title>
				</Empty.Header>
				{#if filtered}
					<Empty.Content>
						<Button variant="outline" onclick={() => navigate({ category: null, q: '', from: '', to: '' })}>
							Clear filters
						</Button>
					</Empty.Content>
				{/if}
			</Empty.Root>
		{:else}
			{@const viewerId = feed.page.viewerId}
			{#each groupActivityByDay(feed.page.events, timeZone) as day (day.day)}
				<section aria-labelledby={`activity-day-${day.day}`} class="grid min-w-0">
					<div class="flex items-baseline justify-between gap-3 border-b border-foreground/60 pb-2">
						<h2 id={`activity-day-${day.day}`} class="font-heading text-xl leading-none">
							{activityDayHeading(day.day, todayKey)}
						</h2>
						<p class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
							{day.events.length}
							{day.events.length === 1 ? 'event' : 'events'}
						</p>
					</div>
					<ul class="grid">
						{#each day.events as event (event.id)}
							{@const described = describeAuditEvent(event, { viewerId })}
							<li
								class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-b py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
							>
								<time
									datetime={event.timestamp}
									title={fullLabel.format(new Date(event.timestamp))}
									class="order-1 pt-1 font-mono text-xs text-muted-foreground"
								>
									{timeLabel.format(new Date(event.timestamp))}
								</time>
								{#if described.category}
									<Badge
										variant="secondary"
										class="order-2 rounded-sm font-mono text-[11px] tracking-[0.08em] uppercase sm:order-3"
									>
										{CATEGORY_LABEL[described.category]}
									</Badge>
								{/if}
								<Collapsible.Root class="order-3 col-span-2 flex min-w-0 gap-3 sm:order-2 sm:col-span-1">
									<span class={['w-0.5 shrink-0 self-stretch rounded-full', SEVERITY_BAR[described.severity]]}>
										{#if described.severity !== 'info'}
											<span class="sr-only">{SEVERITY_LABEL[described.severity]}</span>
										{/if}
									</span>
									<div class="grid min-w-0 flex-1 gap-0.5">
										<p class="text-base leading-snug wrap-anywhere">{described.sentence}</p>
										<div class="flex flex-wrap items-center gap-x-3">
											{#if described.secondary}
												<p class="text-sm text-muted-foreground wrap-anywhere">{described.secondary}</p>
											{/if}
											<Collapsible.Trigger>
												{#snippet child({ props })}
													<Button
														{...props}
														variant="link"
														size="xs"
														class="px-0 text-muted-foreground"
														aria-label={`Details: ${described.sentence}`}
													>
														Details
													</Button>
												{/snippet}
											</Collapsible.Trigger>
										</div>
										<Collapsible.Content>
											<dl class="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
												{#each described.fields as field, index (index)}
													<dt class="text-muted-foreground">{field.label}</dt>
													<dd class="wrap-anywhere">{field.value}</dd>
												{/each}
											</dl>
										</Collapsible.Content>
									</div>
								</Collapsible.Root>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		{/if}
	</section>
	<AdminPager page={pagerPage} totalPages={pagerPages} {pageHref} />
</PageShell.Root>
