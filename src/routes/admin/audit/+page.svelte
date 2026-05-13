<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as PageShell from '$lib/components/ui/page-shell';
	import * as Table from '$lib/components/ui/table';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '$lib/components/admin/adminTheme';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { data } = $props();

	function setParam(key: string, value: string) {
		const params = new SvelteURLSearchParams($page.url.searchParams);
		if (value) params.set(key, value);
		else params.delete(key);
		params.set('page', '1');
		goto(`/admin/audit?${params.toString()}`);
	}

	function goToPage(pageNum: number) {
		const params = new SvelteURLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`/admin/audit?${params.toString()}`);
	}

	const totalPages = $derived(Math.ceil(data.totalCount / data.limit));
</script>

<svelte:head>
	<title>Audit Log - Admin - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide">
	<PageShell.Header
		title="Audit Log"
		subtitle="Central record of authentication, administrative actions, and sensitive resource changes across the platform."
	/>

	<PageShell.FactGrid layout="two">
		<PageShell.Metric label="Total Entries" value={data.totalCount} detail="Events matching the active filter set." />
		<PageShell.Metric
			label="Page"
			value={data.page}
			detail={`Reviewing page ${data.page} of ${Math.max(totalPages, 1)}.`}
		/>
	</PageShell.FactGrid>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div class="grid flex-1 gap-4 sm:grid-cols-2">
				<Field.Root>
					<Field.Label for="action-filter">Action</Field.Label>
					<NativeSelect
						id="action-filter"
						value={data.actionFilter}
						onchange={(event) => setParam('action', event.currentTarget.value)}
					>
						<option value="">All actions</option>
						{#each data.availableActions as action (action)}
							<option value={action}>{formatAdminLabel(action)}</option>
						{/each}
					</NativeSelect>
				</Field.Root>
				<Field.Root>
					<Field.Label for="severity-filter">Severity</Field.Label>
					<NativeSelect
						id="severity-filter"
						value={data.severityFilter}
						onchange={(event) => setParam('severity', event.currentTarget.value)}
					>
						<option value="">All severities</option>
						<option value="info">Info</option>
						<option value="warning">Warning</option>
						<option value="critical">Critical</option>
					</NativeSelect>
				</Field.Root>
			</div>
			<span class="text-sm text-muted-foreground">{data.logs.length} entries shown</span>
		</Card.Content>
	</Card.Root>

	<Card.Root class="overflow-hidden">
		<div class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Timestamp</Table.Head>
						<Table.Head>Severity</Table.Head>
						<Table.Head>Action</Table.Head>
						<Table.Head>User</Table.Head>
						<Table.Head>Resource</Table.Head>
						<Table.Head>IP</Table.Head>
						<Table.Head>Details</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.logs as log (log.id)}
						<Table.Row>
							<Table.Cell class="whitespace-nowrap font-mono text-xs text-muted-foreground">
								{formatDisplayDateTime(log.createdAt)}
							</Table.Cell>
							<Table.Cell
								><Badge variant={adminBadgeVariant(log.severity)}>{formatAdminLabel(log.severity)}</Badge></Table.Cell
							>
							<Table.Cell>
								<code class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
									{formatAdminLabel(log.action)}
								</code>
							</Table.Cell>
							<Table.Cell>
								{#if log.userId}
									<a href="/admin/users/{log.userId}" class="font-mono text-xs">{log.userId.slice(0, 8)}...</a>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</Table.Cell>
							<Table.Cell>
								{#if log.resourceType}
									<div class="grid gap-1">
										<span>{log.resourceType}</span>
										{#if log.resourceId}
											<code class="w-fit rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
												{log.resourceId.slice(0, 8)}...
											</code>
										{/if}
									</div>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</Table.Cell>
							<Table.Cell>
								{#if log.ipAddress}
									<code class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{log.ipAddress}</code>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</Table.Cell>
							<Table.Cell>
								{#if log.details && Object.keys(log.details).length > 0}
									<details>
										<summary class="cursor-pointer text-xs font-medium text-muted-foreground uppercase">View</summary>
										<pre
											class="mt-2 max-w-96 overflow-auto rounded-md border bg-muted p-3 text-xs text-muted-foreground">{JSON.stringify(
												log.details,
												null,
												2
											)}</pre>
									</details>
								{:else}
									<span class="text-muted-foreground">-</span>
								{/if}
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row>
							<Table.Cell colspan={7}>
								<Empty.Root>
									<Empty.Header>
										<Empty.Title>No audit log entries.</Empty.Title>
									</Empty.Header>
								</Empty.Root>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</Card.Root>

	{#if totalPages > 1}
		<div class="flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
			<Button variant="outline" size="sm" disabled={data.page <= 1} onclick={() => goToPage(data.page - 1)}>
				Previous
			</Button>
			<span>Page {data.page} of {totalPages}</span>
			<Button variant="outline" size="sm" disabled={data.page >= totalPages} onclick={() => goToPage(data.page + 1)}>
				Next
			</Button>
		</div>
	{/if}
</PageShell.Root>
