<script lang="ts">
	import { resolve } from '$app/paths';
	import { TriangleAlert } from '@lucide/svelte';
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

	let { data } = $props();

	let searchInput = $state('');
	let tierFilter = $state('all');
	let statusFilter = $state('all');
	let currentPage = $state(1);

	const PAGE_SIZE = 20;

	const filteredSubs = $derived.by(() => {
		let result = data.subscriptions;

		if (searchInput.trim()) {
			const q = searchInput.trim().toLowerCase();
			result = result.filter((sub) => sub.name.toLowerCase().includes(q) || sub.ownerEmail.toLowerCase().includes(q));
		}

		if (tierFilter !== 'all') result = result.filter((sub) => sub.effectiveTier === tierFilter);
		if (statusFilter === 'active') result = result.filter((sub) => !sub.isSuspended && !sub.isGifted);
		if (statusFilter === 'suspended') result = result.filter((sub) => sub.isSuspended);
		if (statusFilter === 'gifted') result = result.filter((sub) => sub.isGifted);
		if (statusFilter === 'canceling')
			result = result.filter((sub) => sub.cancellationSummary?.state === 'canceling_at_period_end');
		if (statusFilter === 'canceled') result = result.filter((sub) => sub.cancellationSummary?.state === 'canceled');
		if (statusFilter === 'drifted') result = result.filter((sub) => sub.billingSnapshot?.driftDetected);

		return result;
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filteredSubs.length / PAGE_SIZE)));
	const pagedSubs = $derived.by(() => {
		const start = (currentPage - 1) * PAGE_SIZE;
		return filteredSubs.slice(start, start + PAGE_SIZE);
	});

	function formatPersonnelCap(count: number, cap: number | null): string {
		return cap === null ? `${count} / Unlimited` : `${count} / ${cap}`;
	}

	function isOverCap(count: number, cap: number | null): boolean {
		return cap !== null && count > cap;
	}

	function formatOptionalDateTime(value: string | null | undefined): string {
		return value ? formatDisplayDateTime(value) : '-';
	}

	function updateSearchInput(event: Event) {
		searchInput = (event.currentTarget as HTMLInputElement).value;
		currentPage = 1;
	}

	function updateTierFilter(event: Event) {
		tierFilter = (event.currentTarget as HTMLSelectElement).value;
		currentPage = 1;
	}

	function updateStatusFilter(event: Event) {
		statusFilter = (event.currentTarget as HTMLSelectElement).value;
		currentPage = 1;
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
			label="Tracked Orgs"
			value={data.subscriptions.length}
			detail="Organizations currently represented in the subscription dataset."
		/>
		<PageShell.Metric
			label="Filtered"
			value={filteredSubs.length}
			detail="Organizations matching the current billing filters."
		/>
		<PageShell.Metric
			label="Drifted"
			value={data.subscriptions.filter((sub) => sub.billingSnapshot?.driftDetected).length}
			detail="Organizations whose last reconciliation found local billing drift."
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
		<Card.Header class="gap-3 xl:flex-row xl:items-end xl:justify-between">
			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(18rem,1fr)_12rem_12rem]">
				<Field.Root>
					<Field.Label for="subscription-search">Search</Field.Label>
					<Field.Control>
						<Input
							id="subscription-search"
							type="text"
							placeholder="Search by org or owner..."
							value={searchInput}
							oninput={updateSearchInput}
						/>
					</Field.Control>
				</Field.Root>
				<Field.Root>
					<Field.Label for="subscription-tier">Tier</Field.Label>
					<Field.Control>
						<NativeSelect id="subscription-tier" value={tierFilter} onchange={updateTierFilter}>
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
						<NativeSelect id="subscription-status" value={statusFilter} onchange={updateStatusFilter}>
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
			</div>
			<p class="text-sm text-muted-foreground">{pagedSubs.length} on page</p>
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
						<Table.Head>Sync Health</Table.Head>
						<Table.Head>Cancellation</Table.Head>
						<Table.Head>Gift</Table.Head>
						<Table.Head>Created</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each pagedSubs as sub (sub.id)}
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
								<Empty.Root class="border-0">No subscriptions found.</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>

	{#if filteredSubs.length > 0}
		<div class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
			<p>
				Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredSubs.length)}-{Math.min(
					currentPage * PAGE_SIZE,
					filteredSubs.length
				)}
				of {filteredSubs.length}
			</p>
			{#if totalPages > 1}
				<div class="flex flex-wrap items-center gap-3">
					<Button
						variant="outline"
						size="sm"
						onclick={() => (currentPage = Math.max(1, currentPage - 1))}
						disabled={currentPage === 1}
					>
						Previous
					</Button>
					<span>Page {currentPage} of {totalPages}</span>
					<Button
						variant="outline"
						size="sm"
						onclick={() => (currentPage = Math.min(totalPages, currentPage + 1))}
						disabled={currentPage === totalPages}
					>
						Next
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</PageShell.Root>
