<script lang="ts">
	import { resolve } from '$app/paths';
	import { Copy, TriangleAlert } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Badge } from '$lib/components/ui/badge';
	import { formatDisplayDate, formatDisplayDateTime } from '$lib/utils/dates';
	import { adminBadgeVariant, adminPlanStatusBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import * as PageShell from '$lib/components/ui/page-shell';
	import * as Table from '$lib/components/ui/table';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageData } from './$types';

	let { data } = $props();

	const subscriptionsRouteRoot = resolve('/admin/subscriptions');
	const tierFilter = $derived(data.pagination.tier ?? 'all');
	const statusFilter = $derived(data.pagination.status ?? 'all');
	type BillingHealthIssue = NonNullable<PageData['billingHealth']>['issues'][number];
	const billingHealth = $derived(
		data.billingHealth ?? {
			generatedAt: '',
			overallState: 'diagnostics_unavailable',
			states: ['diagnostics_unavailable'],
			counts: {
				retryableFailures: 0,
				permanentFailures: 0,
				staleFailedEvents: 0,
				recentPaymentFailures: 0,
				driftedOrganizations: 0,
				staleReconciliation: 0,
				supportAttentionItems: 0
			},
			issues: [],
			diagnosticsError: true
		}
	);

	const showingStart = $derived(
		data.subscriptions.length === 0 ? 0 : (data.pagination.page - 1) * data.pagination.pageSize + 1
	);
	const showingEnd = $derived(
		data.subscriptions.length === 0
			? 0
			: Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalCount)
	);

	function formatPersonnelCap(count: number, cap: number | null): string {
		return cap === null ? `${count} / Unlimited` : `${count} / ${cap}`;
	}

	function isOverCap(count: number, cap: number | null): boolean {
		return cap !== null && count > cap;
	}

	function formatOptionalDateTime(value: string | null | undefined): string {
		return value ? formatDisplayDateTime(value) : '-';
	}

	function supportBundleText(bundle: unknown): string {
		return JSON.stringify(bundle, null, 2);
	}

	function supportBundleCopyLabel(issue: { title: string; organization: { name: string | null } | null }): string {
		return `Copy bundle for ${issue.organization?.name ? `${issue.title} (${issue.organization.name})` : issue.title}`;
	}

	function issueNextSteps(issue: BillingHealthIssue): string {
		return issue.supportBundle.nextSteps.length
			? issue.supportBundle.nextSteps.join(' · ')
			: 'Copy the support bundle and escalate with support-safe context.';
	}

	async function copySupportBundle(bundle: unknown): Promise<void> {
		if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
		try {
			await navigator.clipboard.writeText(supportBundleText(bundle));
		} catch (error) {
			console.error('Failed to copy billing support bundle:', error);
		}
	}

	function pageHref(pageNumber: number): string {
		const params = new SvelteURLSearchParams();
		params.set('page', pageNumber.toString());
		params.set('pageSize', data.pagination.pageSize.toString());
		if (data.pagination.q) params.set('q', data.pagination.q);
		if (tierFilter !== 'all') params.set('tier', tierFilter);
		if (statusFilter !== 'all') params.set('status', statusFilter);
		return `${subscriptionsRouteRoot}?${params.toString()}`;
	}
</script>

<svelte:head>
	<title>Subscriptions - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header
		title="Subscriptions"
		subtitle="Inspect plan state, gifted access, personnel caps, and billing-related organization status in one ledger."
	>
		{#snippet meta()}
			<Badge variant="secondary">Billing Ledger</Badge>
		{/snippet}
	</PageShell.Header>

	<PageShell.FactGrid layout="three">
		<PageShell.Metric
			label="Matching Orgs"
			value={data.pagination.totalCount}
			detail="Organizations matching the current search."
		/>
		<PageShell.Metric
			label="Current Page"
			value={data.subscriptions.length}
			detail={`Page ${data.pagination.page} of ${data.pagination.totalPages}.`}
		/>
		<PageShell.Metric
			label="Billing Drift"
			value={billingHealth.counts.driftedOrganizations}
			detail="Organizations with billing drift from the latest health scan."
		/>
	</PageShell.FactGrid>

	{#if data.billingDiagnosticsError}
		<Alert.Root variant="warning">
			<TriangleAlert />
			<Alert.Title>Billing diagnostics could not be loaded.</Alert.Title>
			<Alert.Description>
				Cancellation timing may be incomplete until the billing snapshot query succeeds.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if billingHealth.diagnosticsError}
		<Alert.Root variant="warning">
			<TriangleAlert />
			<Alert.Title>Billing health diagnostics could not be fully loaded.</Alert.Title>
			<Alert.Description>
				Retry, payment recovery, drift, and reconciliation counts may be incomplete until the health scan succeeds.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if data.planDiagnosticsError}
		<Alert.Root variant="warning">
			<TriangleAlert />
			<Alert.Title>Plan diagnostics could not be fully loaded.</Alert.Title>
			<Alert.Description>
				Some organizations may be missing policy usage details until the plan diagnostics queries succeed.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<Card.Root>
		<Card.Header class="gap-2 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<Card.Title>Billing Health</Card.Title>
				<Card.Description>
					{formatAdminLabel(billingHealth.overallState)} · {billingHealth.counts.retryableFailures} retryable ·
					{billingHealth.counts.staleReconciliation} stale reconciliation. Use the action on each item when TroopToTask has
					a repair tool; otherwise copy the bundle for escalation.
				</Card.Description>
			</div>
			<div class="flex flex-wrap gap-2">
				{#each billingHealth.states as state (state)}
					<Badge variant={adminBadgeVariant(state)}>{formatAdminLabel(state)}</Badge>
				{/each}
			</div>
		</Card.Header>
		<Card.Content>
			{#if billingHealth.issues.length > 0}
				<div class="grid gap-3 lg:grid-cols-2">
					{#each billingHealth.issues as issue (issue.id)}
						<div class="grid gap-2 rounded-md border p-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div>
									<p class="font-medium">{issue.title}</p>
									<p class="text-sm text-muted-foreground">{issue.detail}</p>
								</div>
								<Badge variant={adminBadgeVariant(issue.primaryState)}>{formatAdminLabel(issue.primaryState)}</Badge>
							</div>
							<div class="grid gap-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
								<span class="font-medium">Next action</span>
								<span class="text-muted-foreground">{issueNextSteps(issue)}</span>
							</div>
							<div class="flex flex-wrap justify-end gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									aria-label={supportBundleCopyLabel(issue)}
									onclick={() => copySupportBundle(issue.supportBundle)}
								>
									<Copy class="size-4" aria-hidden="true" />
									Copy bundle
								</Button>
							</div>
							<pre class="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">{supportBundleText(
									issue.supportBundle
								)}</pre>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No billing health support items found.</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="gap-3 xl:flex-row xl:items-end xl:justify-between">
			<form
				method="GET"
				action={subscriptionsRouteRoot}
				class="grid flex-1 gap-3 xl:grid-cols-[minmax(18rem,1fr)_9rem_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] xl:items-end"
			>
				<input type="hidden" name="page" value="1" />
				<Field.Root>
					<Field.Label for="subscription-search">Search</Field.Label>
					<Field.Control>
						<Input
							id="subscription-search"
							name="q"
							type="search"
							placeholder="Search by organization name..."
							value={data.pagination.q}
						/>
					</Field.Control>
				</Field.Root>
				<Field.Root>
					<Field.Label for="subscription-page-size">Rows</Field.Label>
					<Field.Control>
						<NativeSelect id="subscription-page-size" name="pageSize" value={String(data.pagination.pageSize)}>
							<option value="25">25</option>
							<option value="50">50</option>
							<option value="100">100</option>
						</NativeSelect>
					</Field.Control>
				</Field.Root>
				<Field.Root>
					<Field.Label for="subscription-tier">Tier</Field.Label>
					<Field.Control>
						<NativeSelect id="subscription-tier" name="tier" value={tierFilter}>
							<option value="all">All tiers</option>
							<option value="free">Free</option>
							<option value="team">Team</option>
							<option value="unit">Unit</option>
						</NativeSelect>
					</Field.Control>
				</Field.Root>
				<Field.Root>
					<Field.Label for="subscription-status">Status</Field.Label>
					<Field.Control>
						<NativeSelect id="subscription-status" name="status" value={statusFilter}>
							<option value="all">All statuses</option>
							<option value="active">Active</option>
							<option value="suspended">Suspended</option>
							<option value="gifted">Gifted</option>
							<option value="canceling">Canceling</option>
							<option value="canceled">Canceled</option>
							<option value="drifted">Drifted</option>
						</NativeSelect>
					</Field.Control>
				</Field.Root>
				<Button type="submit" variant="outline">Apply</Button>
			</form>
			<p class="text-sm text-muted-foreground">{data.subscriptions.length} shown</p>
		</Card.Header>
		<Card.Content class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Organization</Table.Head>
						<Table.Head>Tier</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Personnel</Table.Head>
						<Table.Head>Plan Usage</Table.Head>
						<Table.Head>Owner</Table.Head>
						<Table.Head>Billing Freshness</Table.Head>
						<Table.Head>Cancellation</Table.Head>
						<Table.Head>Gift</Table.Head>
						<Table.Head>Created</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.subscriptions as sub (sub.id)}
						<Table.Row>
							<Table.Cell>
								<div class="grid gap-1">
									<a
										href={resolve(`/admin/organizations/${sub.id}` as `/admin/organizations/${string}`)}
										class="text-sm font-medium underline-offset-4 hover:underline">{sub.name}</a
									>
									<span class="font-mono text-xs text-muted-foreground">{sub.id.slice(0, 8)}...</span>
								</div>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={adminBadgeVariant(sub.effectiveTier)}>{formatAdminLabel(sub.effectiveTier)}</Badge>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={adminBadgeVariant(sub.isSuspended ? 'suspended' : 'active')}>
									{sub.isSuspended ? 'Suspended' : 'Active'}
								</Badge>
							</Table.Cell>
							<Table.Cell
								class={isOverCap(sub.personnelCount, sub.personnelCap) ? 'font-semibold text-destructive' : ''}
							>
								{formatPersonnelCap(sub.personnelCount, sub.personnelCap)}
							</Table.Cell>
							<Table.Cell>
								{#if sub.planDiagnostics}
									<div class="grid gap-2">
										<div class="flex flex-wrap items-center gap-2">
											<Badge variant={adminBadgeVariant(sub.planDiagnostics.effectivePlan.tier)}>
												{formatAdminLabel(sub.planDiagnostics.effectivePlan.tier)}
											</Badge>
											<span class="text-xs text-muted-foreground">
												{sub.planDiagnostics.effectivePlan.sourceLabel}
											</span>
										</div>
										<ul class="grid gap-1 text-xs text-muted-foreground">
											{#each sub.planDiagnostics.usageRows as row (row.dimension)}
												<li class="flex flex-wrap items-center gap-1">
													<span>{row.label}</span>
													<span>{row.used} / {row.limitLabel}</span>
													<Badge variant={adminPlanStatusBadgeVariant(row.status)}>{formatAdminLabel(row.status)}</Badge
													>
												</li>
											{/each}
										</ul>
										{#if sub.planDiagnostics.overLimitReasons.length > 0}
											<p class="text-xs font-medium text-destructive">
												{sub.planDiagnostics.overLimitReasons.length} plan blocker{sub.planDiagnostics.overLimitReasons
													.length === 1
													? ''
													: 's'}
											</p>
										{/if}
									</div>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="max-w-60 break-words text-muted-foreground">{sub.ownerEmail || '-'}</Table.Cell>
							<Table.Cell>
								{#if sub.billingSnapshot}
									<div class="grid gap-1">
										<Badge variant={sub.billingSnapshot.driftDetected ? 'warning' : 'secondary'}>
											{sub.billingSnapshot.driftDetected ? 'Drifted' : formatAdminLabel(sub.billingSnapshot.syncStatus)}
										</Badge>
										<span class="text-muted-foreground">
											{formatAdminLabel(sub.billingSnapshot.source)} /
											{formatAdminLabel(sub.billingSnapshot.subscriptionStatus ?? 'unknown')}
										</span>
										<span class="text-muted-foreground">
											Last checked {formatOptionalDateTime(sub.billingSnapshot.lastReconciledAt)}
										</span>
										{#if sub.billingSnapshot.reconciliationResult}
											<span class="max-w-52 break-words font-mono text-xs text-muted-foreground">
												{sub.billingSnapshot.reconciliationResult}
											</span>
										{/if}
									</div>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</Table.Cell>
							<Table.Cell>
								{#if sub.cancellationSummary?.state === 'canceling_at_period_end'}
									<div class="grid gap-1">
										<Badge variant="warning">Cancels at period end</Badge>
										<span class="text-muted-foreground">
											paid through {formatOptionalDateTime(sub.cancellationSummary.currentPeriodEnd)}
										</span>
									</div>
								{:else if sub.cancellationSummary?.state === 'canceled'}
									<div class="grid gap-1">
										<Badge variant="secondary">Canceled</Badge>
										<span class="text-muted-foreground">
											canceled {formatOptionalDateTime(sub.cancellationSummary.canceledAt)}
										</span>
									</div>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</Table.Cell>
							<Table.Cell>
								{#if sub.isGifted}
									<div class="grid gap-1">
										<Badge variant="warning">Gifted</Badge>
										{#if sub.gift_expires_at}
											<span class="text-muted-foreground">until {formatDisplayDate(sub.gift_expires_at)}</span>
										{/if}
									</div>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</Table.Cell>
							<Table.Cell>{formatDisplayDate(sub.created_at)}</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={10}>
								<Empty.Root class="border-0">No matching subscriptions.</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	{#if data.pagination.totalCount > 0}
		<div class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
			<p>
				Showing {showingStart}-{showingEnd} of {data.pagination.totalCount}
			</p>
			{#if data.pagination.totalPages > 1}
				<div class="flex flex-wrap items-center gap-3">
					<Button
						href={pageHref(data.pagination.page - 1)}
						variant="outline"
						size="sm"
						disabled={data.pagination.page === 1}
					>
						Previous
					</Button>
					<span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
					<Button
						href={pageHref(data.pagination.page + 1)}
						variant="outline"
						size="sm"
						disabled={data.pagination.page === data.pagination.totalPages}
					>
						Next
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</PageShell.Root>
