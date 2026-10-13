<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import { Separator } from '$lib/components/ui/separator';
	import * as Table from '$lib/components/ui/table';
	import { REPORT_CHART_SERIES, buildReportCountTicks } from '$lib/components/patterns/report-chart';
	import { ReportBarChart } from '$lib/components/patterns/report-chart';
	import { formatDisplayDateTime } from '$lib/utils/dates';

	let { data } = $props();

	const totalPending = $derived(data.pendingAccessRequests + data.pendingFeedback);
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
	const toolbarItems = $derived<ToolbarItem[]>(
		data.accessiblePages.includes('audit')
			? [{ kind: 'action', id: 'audit-log', label: 'Audit Log', href: '/admin/audit' }]
			: []
	);
	const toolbarPrimary = $derived<WorkspaceToolbarProps['primary']>(
		data.accessiblePages.includes('users')
			? { kind: 'action', id: 'inspect-users', label: 'Inspect Users', href: '/admin/users' }
			: undefined
	);
	const quickActions = $derived(
		[
			{ page: 'users', href: '/admin/users', label: 'Search Users' },
			{ page: 'organizations', href: '/admin/organizations', label: 'Inspect Orgs' },
			{ page: 'access-requests', href: '/admin/access-requests', label: 'Access Queue' },
			{ page: 'feedback', href: '/admin/feedback', label: 'Feedback Queue' }
		].filter((link) => data.accessiblePages.some((page) => page === link.page))
	);
</script>

<svelte:head>
	<title>Admin Dashboard - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header title="Admin Dashboard" subtitle="Track platform growth and the trust queue from one place." />

	{#if toolbarItems.length > 0 || toolbarPrimary}
		<WorkspaceToolbar ariaLabel="Admin Dashboard controls" items={toolbarItems} primary={toolbarPrimary} />
	{/if}

	{#if totalPending > 0}
		<div class="grid gap-3 md:grid-cols-2">
			{#if data.pendingAccessRequests > 0}
				<Alert.Root variant="warning">
					<Alert.Title>Access Requests</Alert.Title>
					<Alert.Description>{data.pendingAccessRequests} pending review.</Alert.Description>
					{#if data.accessiblePages.includes('access-requests')}
						<Button href="/admin/access-requests" size="sm" variant="outline" class="mt-1 w-fit">Open Queue</Button>
					{/if}
				</Alert.Root>
			{/if}
			{#if data.pendingFeedback > 0}
				<Alert.Root variant="info">
					<Alert.Title>Feedback Queue</Alert.Title>
					<Alert.Description>
						{data.pendingFeedback} unread item{data.pendingFeedback === 1 ? '' : 's'}.
					</Alert.Description>
					{#if data.accessiblePages.includes('feedback')}
						<Button href="/admin/feedback" size="sm" variant="outline" class="mt-1 w-fit">Review Notes</Button>
					{/if}
				</Alert.Root>
			{/if}
		</div>
	{/if}

	<PageShell.FactGrid layout="three">
		<PageShell.Metric
			label="Total Users"
			value={data.userStats.total.toLocaleString()}
			detail={`+${data.userStats.last_30_days} in 30 days (${recentPct}% of all accounts)`}
		/>
		<PageShell.Metric label="Organizations" value={data.totalOrganizations.toLocaleString()} />
		<PageShell.Metric
			label="Pending Items"
			value={totalPending.toLocaleString()}
			tone={totalPending > 0 ? 'warning' : 'default'}
			detail={`${data.pendingAccessRequests} requests and ${data.pendingFeedback} feedback items`}
		/>
	</PageShell.FactGrid>

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
					<Table.Root aria-label="Admin signup trend data">
						<Table.Header>
							<Table.Row>
								<Table.Head scope="col">Date</Table.Head>
								<Table.Head scope="col">New accounts</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.signupTrend as day (day.date)}
								<Table.Row>
									<Table.Cell>{day.date}</Table.Cell>
									<Table.Cell>{day.count}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title level={4}>No signup data available.</Empty.Title>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</Card.Content>
	</Card.Root>

	<div class="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(18rem,1fr)]">
		<Card.Root>
			<Card.Header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div class="grid gap-1.5">
					<Card.Title>Recent Activity</Card.Title>
					<Card.Description>Most recent audit events entering the platform trail.</Card.Description>
				</div>
				{#if data.accessiblePages.includes('audit')}
					<Button href="/admin/audit" variant="outline" size="sm">View Full Log</Button>
				{/if}
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
							<Empty.Title level={4}>No recent activity.</Empty.Title>
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
				{#each quickActions as link (link.href)}
					<Button href={link.href} variant="outline" class="justify-start">{link.label}</Button>
				{:else}
					<p class="text-sm text-muted-foreground">Your assigned workspace is the Dashboard.</p>
				{/each}
				{#if data.accessiblePages.includes('users') && data.accessiblePages.includes('organizations')}
					<Separator class="my-1" />
					<p class="text-xs text-muted-foreground">Use global admin search for direct user and organization lookup.</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</PageShell.Root>
