<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/ui/page-shell';
	import { Separator } from '$lib/components/ui/separator';
	import { REPORT_CHART_SERIES, buildReportCountTicks } from '$lib/components/charts/reportChartConventions';
	import { ReportBarChart } from '$lib/components/ui/report-chart';
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data } = $props();

	const totalPending = $derived(data.pendingAccessRequests + data.pendingFeedback);
	const paidCount = $derived(data.tierCounts.team + data.tierCounts.unit);
	const recentPct = $derived(
		data.userStats.total > 0 ? Math.round((data.userStats.last_30_days / data.userStats.total) * 100) : 0
	);
	const maxSignups = $derived(
		data.signupTrend.length > 0 ? Math.max(...data.signupTrend.map((day: { count: number }) => day.count), 1) : 1
	);
	const signupTicks = $derived(buildReportCountTicks(maxSignups, { denseMax: 4 }));
	const signupChartData = $derived(
		data.signupTrend.map((day: { date: string; count: number }) => ({
			label: day.date.slice(5),
			signups: day.count
		}))
	);
	const signupSeries = [
		{
			key: 'signups',
			label: 'New accounts',
			color: REPORT_CHART_SERIES[1].color
		}
	];
	const totalTierOrgs = $derived(data.tierCounts.free + data.tierCounts.team + data.tierCounts.unit);
</script>

<svelte:head>
	<title>Admin Dashboard - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header
		title="Admin Dashboard"
		subtitle="Track platform growth, subscription mix, and the trust queue from one place."
	>
		{#snippet actions()}
			<Button href="/admin/audit" variant="outline">Audit Log</Button>
			<Button href="/admin/users">Inspect Users</Button>
		{/snippet}
	</PageShell.Header>

	{#if totalPending > 0}
		<div class="grid gap-3 md:grid-cols-2">
			{#if data.pendingAccessRequests > 0}
				<Alert.Root variant="warning">
					<Alert.Title>Access Requests</Alert.Title>
					<Alert.Description>{data.pendingAccessRequests} pending review.</Alert.Description>
					<Alert.Action>
						<Button href="/admin/access-requests" size="sm" variant="outline">Open Queue</Button>
					</Alert.Action>
				</Alert.Root>
			{/if}
			{#if data.pendingFeedback > 0}
				<Alert.Root variant="info">
					<Alert.Title>Feedback Queue</Alert.Title>
					<Alert.Description>
						{data.pendingFeedback} unread item{data.pendingFeedback === 1 ? '' : 's'}.
					</Alert.Description>
					<Alert.Action>
						<Button href="/admin/feedback" size="sm" variant="outline">Review Notes</Button>
					</Alert.Action>
				</Alert.Root>
			{/if}
		</div>
	{/if}

	<PageShell.FactGrid layout="two" class="lg:grid-cols-4">
		<PageShell.Metric
			label="Total Users"
			value={data.userStats.total.toLocaleString()}
			detail={`+${data.userStats.last_30_days} in 30 days (${recentPct}% of all accounts)`}
		/>
		<PageShell.Metric
			label="Organizations"
			value={data.totalOrganizations.toLocaleString()}
			detail={`${data.tierCounts.free} free / ${data.tierCounts.team} team / ${data.tierCounts.unit} unit`}
		/>
		<PageShell.Metric
			label="Paid Subscriptions"
			value={paidCount.toLocaleString()}
			detail={`${data.tierCounts.team} team plans and ${data.tierCounts.unit} unit plans active`}
		/>
		<PageShell.Metric
			label="Pending Items"
			value={totalPending.toLocaleString()}
			tone={totalPending > 0 ? 'warning' : 'default'}
			detail={`${data.pendingAccessRequests} requests and ${data.pendingFeedback} feedback items`}
		/>
	</PageShell.FactGrid>

	<div class="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(18rem,1fr)]">
		<Card.Root>
			<Card.Header>
				<Card.Title>Signups</Card.Title>
				<Card.Description>Last 30 days of account creation activity.</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.signupTrend.length > 0}
					<ReportBarChart
						data={signupChartData}
						series={signupSeries}
						ariaLabel="Admin signup trend by day"
						yDomain={[0, maxSignups]}
						yTicks={signupTicks}
						layout="group"
						heightClass="h-[190px]"
					/>
					<div class="sr-only">
						<table aria-label="Admin signup trend data">
							<thead>
								<tr>
									<th scope="col">Date</th>
									<th scope="col">New accounts</th>
								</tr>
							</thead>
							<tbody>
								{#each data.signupTrend as day (day.date)}
									<tr>
										<td>{day.date}</td>
										<td>{day.count}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<Empty.Root>
						<Empty.Header>
							<Empty.Title>No signup data available.</Empty.Title>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Subscription Mix</Card.Title>
				<Card.Description>Current organization distribution by plan.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				{#each [{ label: 'Free', value: data.tierCounts.free }, { label: 'Team', value: data.tierCounts.team }, { label: 'Unit', value: data.tierCounts.unit }] as tier (tier.label)}
					<div class="grid gap-1.5">
						<div class="flex items-center justify-between gap-3 text-sm">
							<span>{tier.label}</span>
							<strong>{tier.value}</strong>
						</div>
						<div class="h-2 overflow-hidden rounded-full bg-muted">
							<div
								class="h-full rounded-full bg-primary"
								style="width: {totalTierOrgs > 0 ? Math.round((tier.value / totalTierOrgs) * 100) : 0}%"
							></div>
						</div>
					</div>
				{/each}
			</Card.Content>
		</Card.Root>
	</div>

	<div class="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(18rem,1fr)]">
		<Card.Root>
			<Card.Header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div class="grid gap-1.5">
					<Card.Title>Recent Activity</Card.Title>
					<Card.Description>Most recent audit events entering the platform trail.</Card.Description>
				</div>
				<Button href="/admin/audit" variant="outline" size="sm">View Full Log</Button>
			</Card.Header>
			<Card.Content>
				{#if data.recentActivity.length > 0}
					<div class="grid gap-3">
						{#each data.recentActivity as event (event.id)}
							<div class="grid gap-2 border-b pb-3 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
								<div class="grid min-w-0 gap-1">
									<strong class="truncate text-sm">{event.action}</strong>
									{#if event.user_id}
										<code class="w-fit rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
											>{event.user_id}</code
										>
									{:else}
										<span class="text-sm text-muted-foreground">System event</span>
									{/if}
								</div>
								<span class="text-xs text-muted-foreground">{formatDisplayDateTime(event.timestamp)}</span>
							</div>
						{/each}
					</div>
				{:else}
					<Empty.Root>
						<Empty.Header>
							<Empty.Title>No recent activity.</Empty.Title>
						</Empty.Header>
					</Empty.Root>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Quick Actions</Card.Title>
				<Card.Description>Fast paths into the highest-traffic admin workflows.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-2">
				{#each [{ href: '/admin/users', label: 'Search Users' }, { href: '/admin/organizations', label: 'Inspect Orgs' }, { href: '/admin/access-requests', label: 'Access Queue' }, { href: '/admin/feedback', label: 'Feedback Queue' }, { href: '/admin/subscriptions', label: 'Subscriptions' }] as link (link.href)}
					<Button href={link.href} variant="outline" class="justify-start">{link.label}</Button>
				{/each}
				<Separator class="my-1" />
				<p class="text-xs text-muted-foreground">Use global admin search for direct user and organization lookup.</p>
			</Card.Content>
		</Card.Root>
	</div>
</PageShell.Root>
