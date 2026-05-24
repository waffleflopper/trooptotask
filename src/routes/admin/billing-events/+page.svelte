<script lang="ts">
	import { TriangleAlert } from '@lucide/svelte';
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

	const retryableCount = $derived(data.events.filter((event) => event.canRetry).length);

	function formatOptionalDateTime(value: string | null | undefined): string {
		return value ? formatDisplayDateTime(value) : '-';
	}

	function eventShortId(id: string): string {
		return id.length > 18 ? `${id.slice(0, 18)}...` : id;
	}

	function stateLabel(state: string | null): string {
		return state ? formatAdminLabel(state) : 'Unknown';
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

	<PageShell.FactGrid layout="two">
		<PageShell.Metric
			label="Recent Events"
			value={data.events.length}
			detail="Most recent billing webhook ledger rows."
		/>
		<PageShell.Metric label="Retryable Failures" value={retryableCount} detail="Events eligible for a guarded retry." />
	</PageShell.FactGrid>

	{#if data.diagnosticsError}
		<Alert.Root variant="warning">
			<TriangleAlert />
			<Alert.Title>Some billing diagnostics could not be loaded.</Alert.Title>
			<Alert.Description>
				Event rows are still shown when available, but organization links may be incomplete.
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
