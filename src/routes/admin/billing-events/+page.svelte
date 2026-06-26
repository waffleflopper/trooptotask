<script lang="ts">
	import { resolve } from '$app/paths';
	import { Copy, ExternalLink, RefreshCw, TriangleAlert } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/ui/page-shell';
	import * as Table from '$lib/components/ui/table';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type BillingHealthIssue = NonNullable<PageData['billingHealth']>['issues'][number];

	const retryableCount = $derived(data.events.filter((event) => event.canRetry).length);
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
	const hasDiagnosticsWarning = $derived(data.diagnosticsError || billingHealth.diagnosticsError);
	const canAccessOrganizationDiagnostics = $derived(data.adminRole === 'super_admin');

	function formatOptionalDateTime(value: string | null | undefined): string {
		return value ? formatDisplayDateTime(value) : '-';
	}

	function eventShortId(id: string): string {
		return id.length > 18 ? `${id.slice(0, 18)}...` : id;
	}

	function stateLabel(state: string | null): string {
		return state ? formatAdminLabel(state) : 'Unknown';
	}

	function supportBundleText(bundle: unknown): string {
		return JSON.stringify(bundle, null, 2);
	}

	function supportBundleCopyLabel(issue: { title: string; organization: { name: string | null } | null }): string {
		return `Copy bundle for ${issue.organization?.name ? `${issue.title} (${issue.organization.name})` : issue.title}`;
	}

	function issueContextLabel(issue: BillingHealthIssue): string {
		return issue.organization?.name ? `${issue.title} (${issue.organization.name})` : issue.title;
	}

	function issueNextSteps(issue: BillingHealthIssue): string {
		return issue.supportBundle.nextSteps.length
			? issue.supportBundle.nextSteps.join(' · ')
			: 'Copy the support bundle and escalate with support-safe context.';
	}

	function retryEventId(issue: BillingHealthIssue): string | null {
		return issue.states.includes('needs_retry') ? (issue.latestEventIds[0] ?? null) : null;
	}

	function organizationDiagnosticsHref(issue: BillingHealthIssue): string | null {
		if (!canAccessOrganizationDiagnostics) return null;
		if (!issue.organization?.id) return null;
		return `${resolve(`/admin/organizations/${issue.organization.id}` as `/admin/organizations/${string}`)}#billing-diagnostics`;
	}

	function retryEventLabel(issue: BillingHealthIssue, eventId: string): string {
		return `Retry event for ${issueContextLabel(issue)} ${eventId}`;
	}

	function organizationDiagnosticsLabel(issue: BillingHealthIssue): string {
		return `Open organization billing diagnostics for ${issueContextLabel(issue)}`;
	}

	async function copySupportBundle(bundle: unknown): Promise<void> {
		if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
		try {
			await navigator.clipboard.writeText(supportBundleText(bundle));
		} catch (error) {
			console.error('Failed to copy billing support bundle:', error);
		}
	}
</script>

<svelte:head>
	<title>Billing Events - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header
		title="Billing Events"
		subtitle="Inspect Stripe webhook processing state and retry transient billing failures without exposing raw event payloads."
	>
		{#snippet meta()}
			<Badge variant="secondary">Stripe Ledger</Badge>
		{/snippet}
	</PageShell.Header>

	<PageShell.FactGrid layout="three">
		<PageShell.Metric
			label="Recent Events"
			value={data.events.length}
			detail="Most recent billing webhook ledger rows."
		/>
		<PageShell.Metric
			label="Retryable Failures"
			value={billingHealth.counts.retryableFailures}
			detail="Health scan events eligible for guarded retry."
		/>
		<PageShell.Metric
			label="Support Attention"
			value={billingHealth.counts.supportAttentionItems}
			detail="Billing health items needing review."
		/>
	</PageShell.FactGrid>

	{#if hasDiagnosticsWarning}
		<Alert.Root variant="warning">
			<TriangleAlert />
			<Alert.Title>Some billing diagnostics could not be fully loaded.</Alert.Title>
			<Alert.Description>
				Use the billing events ledger and health summary cautiously until diagnostics can read events and billing
				snapshots.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if form?.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{form.error}</Alert.Description>
		</Alert.Root>
	{:else if form?.success}
		<Alert.Root>
			<Alert.Description>
				Retried {eventShortId(form.eventId)}. Result: {form.result}
			</Alert.Description>
		</Alert.Root>
	{/if}

	<Card.Root>
		<Card.Header class="gap-2 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<Card.Title>Billing Health</Card.Title>
				<Card.Description>
					{formatAdminLabel(billingHealth.overallState)} · {billingHealth.counts.permanentFailures} permanent failures · {billingHealth
						.counts.recentPaymentFailures} payment recovery items. Use the action on each item when TroopToTask has a repair
					tool; otherwise copy the bundle for escalation.
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
						{@const eventId = retryEventId(issue)}
						{@const diagnosticsHref = organizationDiagnosticsHref(issue)}
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
								{#if eventId}
									<form method="POST" action="?/retry">
										<input type="hidden" name="eventId" value={eventId} />
										<Button type="submit" size="sm" variant="outline" aria-label={retryEventLabel(issue, eventId)}>
											<RefreshCw class="size-4" aria-hidden="true" />
											Retry event
										</Button>
									</form>
								{/if}
								{#if diagnosticsHref}
									<Button
										href={diagnosticsHref}
										size="sm"
										variant="outline"
										aria-label={organizationDiagnosticsLabel(issue)}
									>
										<ExternalLink class="size-4" aria-hidden="true" />
										Org diagnostics
									</Button>
								{/if}
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

	<Card.Root class="overflow-hidden">
		<Card.Header class="gap-2 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<Card.Title>Webhook Ledger</Card.Title>
				<Card.Description>{retryableCount} retryable failures in the current result set.</Card.Description>
			</div>
		</Card.Header>
		<Card.Content class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-[210px]">Event</Table.Head>
						<Table.Head class="w-[140px]">State</Table.Head>
						<Table.Head class="w-[90px]">Attempts</Table.Head>
						<Table.Head class="w-[190px]">Organization</Table.Head>
						<Table.Head class="w-[190px]">Object</Table.Head>
						<Table.Head class="w-[175px]">Event Time</Table.Head>
						<Table.Head class="w-[175px]">Processed</Table.Head>
						<Table.Head class="w-[280px]">Result</Table.Head>
						<Table.Head class="w-[160px]">Last Error</Table.Head>
						<Table.Head class="w-[70px] text-right">Action</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.events as event (event.id)}
						<Table.Row>
							<Table.Cell>
								<div class="grid gap-1">
									<span class="font-medium">{event.type}</span>
									<span class="font-mono text-xs text-muted-foreground">{eventShortId(event.id)}</span>
								</div>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={adminBadgeVariant(event.processingState ?? 'unknown')}>
									{stateLabel(event.processingState)}
								</Badge>
							</Table.Cell>
							<Table.Cell>{event.attemptCount}</Table.Cell>
							<Table.Cell>
								{#if event.organization}
									<div class="grid gap-1">
										<span>{event.organization.name ?? 'Unnamed organization'}</span>
										<span class="font-mono text-xs text-muted-foreground">{event.organization.id.slice(0, 8)}...</span>
									</div>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="whitespace-normal break-all font-mono text-xs">
								{event.objectId ?? event.secondaryDedupeKey ?? '-'}
							</Table.Cell>
							<Table.Cell>{formatOptionalDateTime(event.eventCreatedAt)}</Table.Cell>
							<Table.Cell>{formatOptionalDateTime(event.processedAt)}</Table.Cell>
							<Table.Cell class="whitespace-normal break-words text-sm text-muted-foreground">
								{event.processingResult ?? '-'}
							</Table.Cell>
							<Table.Cell class="whitespace-normal break-words text-sm text-muted-foreground">
								{event.lastError ?? '-'}
							</Table.Cell>
							<Table.Cell class="whitespace-nowrap text-right">
								{#if event.canRetry}
									<form method="POST" action="?/retry">
										<input type="hidden" name="eventId" value={event.id} />
										<Button type="submit" size="sm" variant="outline">Retry</Button>
									</form>
								{:else}
									<span class="text-xs text-muted-foreground">Unavailable</span>
								{/if}
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={10}>
								<Empty.Root class="border-0">No billing events found.</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</PageShell.Root>
