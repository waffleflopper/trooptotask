<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import { WorkspaceToolbar } from '$lib/components/patterns/workspace-toolbar';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import AdminPager from './AdminPager.svelte';
	import { createAdminUrlSearch } from './adminUrlSearch.svelte';
	import {
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
	const SEVERITY_BAR = { info: '', warning: 'bg-warning', critical: 'bg-destructive' } as const;
	const SEVERITY_LABEL = { info: 'Info', warning: 'Warning', critical: 'Critical' } as const;

	let feed = $state<Feed>({ status: 'loading' });
	let attempt = $state(0);
	const key = $derived(activitySearchParams(query).toString());

	// A reply that lands after the filters moved on must not change the screen, so each run aborts its predecessor.
	$effect(() => {
		void key;
		void attempt;
		const controller = new AbortController();
		feed = { status: 'loading' };
		load(
			untrack(() => query),
			untrack(() => timeZone),
			controller.signal
		).then(
			(page) => {
				if (!controller.signal.aborted) feed = { status: 'ready', page };
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
	const totalPages = $derived(
		feed.status === 'ready' ? Math.max(1, Math.ceil(feed.page.totalCount / feed.page.pageSize)) : 1
	);

	function pageHref(page: number): string {
		return href({ ...query, page });
	}

	const dayLabel = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const timeLabel = $derived(new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }));
	const fullLabel = $derived(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'long', timeZone }));

	const rangePresets = $derived(activityRangePresets(timeZone, today));
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
		title="Activity"
		subtitle={`Every platform action, newest first. Times are in ${timeZone.replace(/_/g, ' ')}.`}
	/>

	<div class="grid gap-3">
		<SegmentedFilter.Root
			label="Category"
			options={CATEGORY_OPTIONS}
			bind:value={() => query.category ?? 'all', (next) => navigate({ category: next === 'all' ? null : next })}
		/>
		<div class="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-start">
			<WorkspaceToolbar
				ariaLabel="Activity controls"
				items={[]}
				search={{
					label: 'Search',
					placeholder: 'Search activity',
					value: search.value,
					onValueChange: search.setValue
				}}
			/>
			<div class="grid min-w-0 gap-2 rounded-lg border bg-card p-3">
				<p class="text-sm font-medium">Date range</p>
				<ReportWorkspace.DateRangeField bind:start bind:end presets={rangePresets} />
				{#if query.from || query.to}
					<div>
						<Button variant="ghost" size="sm" onclick={() => navigate({ from: '', to: '' })}>Clear dates</Button>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<section aria-label="Activity events" aria-busy={feed.status === 'loading'} class="grid min-w-0 gap-4">
		{#if feed.status === 'loading'}
			<div class="grid gap-6" aria-hidden="true" data-testid="activity-skeleton">
				{#each [0, 1] as group (group)}
					<div class="grid gap-3">
						<Skeleton class="h-5 w-48" />
						{#each [0, 1, 2, 3] as row (row)}
							<div class="flex gap-3 rounded-lg border p-3">
								<Skeleton class="w-1 self-stretch" />
								<div class="grid min-w-0 flex-1 gap-2">
									<Skeleton class="h-5 w-4/5" />
									<Skeleton class="h-4 w-40" />
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
			<p role="status" class="text-sm text-muted-foreground">
				{feed.page.totalCount}
				{feed.page.totalCount === 1 ? 'event' : 'events'}
			</p>
			{#each groupActivityByDay(feed.page.events, timeZone) as day (day.day)}
				<section aria-labelledby={`activity-day-${day.day}`} class="grid gap-2">
					<h2 id={`activity-day-${day.day}`} class="text-sm font-semibold">
						{dayLabel.format(new Date(`${day.day}T12:00:00Z`))}
					</h2>
					<ul class="grid gap-2">
						{#each day.events as event (event.id)}
							{@const described = describeAuditEvent(event)}
							<li class="flex min-w-0 gap-3 rounded-lg border bg-card p-3">
								<span class={['w-1 shrink-0 self-stretch rounded-full', SEVERITY_BAR[described.severity]]}>
									{#if described.severity !== 'info'}
										<span class="sr-only">{SEVERITY_LABEL[described.severity]}</span>
									{/if}
								</span>
								<div class="grid min-w-0 flex-1 gap-1">
									<p class="font-medium wrap-anywhere">{described.sentence}</p>
									<p class="text-xs text-muted-foreground">
										<time datetime={event.timestamp} title={fullLabel.format(new Date(event.timestamp))}>
											{timeLabel.format(new Date(event.timestamp))}
										</time>
										{#if event.orgId}
											<span aria-hidden="true">·</span>
											<span class="wrap-anywhere">{event.orgName ?? `Organization ${event.orgId.slice(0, 8)}`}</span>
										{/if}
									</p>
									<Collapsible.Root>
										<Collapsible.Trigger>
											{#snippet child({ props })}
												<Button {...props} variant="ghost" size="xs" aria-label={`Details: ${described.sentence}`}>
													Details
												</Button>
											{/snippet}
										</Collapsible.Trigger>
										<Collapsible.Content>
											<dl class="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
												{#each described.fields as field, index (index)}
													<dt class="text-muted-foreground">{field.label}</dt>
													<dd class="wrap-anywhere">{field.value}</dd>
												{/each}
											</dl>
										</Collapsible.Content>
									</Collapsible.Root>
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
			<AdminPager page={feed.page.page} {totalPages} {pageHref} />
		{/if}
	</section>
</PageShell.Root>
