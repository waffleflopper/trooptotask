<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import type { Receipt } from '../commit';
	import { plural, type FlowSession } from '../flowTypes';

	let { session, receipt }: { session: FlowSession; receipt: Receipt } = $props();

	const LISTED = 100;
	const ROWS = { one: 'row', other: 'rows' };
	const CHANGES = { one: 'change', other: 'changes' };

	const saved = $derived(receipt.added + receipt.updated);
	const listed = $derived(receipt.notImported.slice(0, LISTED));
	const savedIn = $derived(session.lane.savedIn ?? 'the saved records');
	const metrics = $derived(
		(
			[
				{ label: 'Added', value: receipt.added, tone: 'success' },
				{ label: 'Updated', value: receipt.updated },
				{ label: 'Unchanged', value: receipt.unchanged },
				{ label: 'Skipped', value: receipt.skipped },
				{ label: 'Failed', value: receipt.failed, tone: 'danger' },
				{
					label: 'Not confirmed',
					value: receipt.unconfirmed,
					tone: 'warning',
					detail: `Check ${savedIn} before importing these again.`
				},
				{ label: 'Not attempted', value: receipt.notAttempted, tone: 'warning' }
			] as const
		).filter((metric) => metric.value > 0)
	);
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
	<section class="grid content-start gap-5" aria-labelledby="import-done-heading">
		<div class="grid gap-1">
			<h2 id="import-done-heading" class="font-heading text-3xl font-semibold uppercase">
				{plural(saved, CHANGES)} saved.
			</h2>
			<p class="text-sm text-muted-foreground">From {session.file?.name}.</p>
		</div>
		<PageShell.FactGrid layout="three">
			{#each metrics as metric (metric.label)}
				<PageShell.Metric
					label={metric.label}
					value={metric.value.toLocaleString()}
					tone={'tone' in metric ? metric.tone : 'default'}
					detail={'detail' in metric ? metric.detail : undefined}
				/>
			{/each}
		</PageShell.FactGrid>
		{#if receipt.stopped?.kind === 'refused'}
			<Alert.Root variant="destructive">
				<Alert.Title>The import stopped</Alert.Title>
				<Alert.Description>{receipt.stopped.message} The rows after it were not sent.</Alert.Description>
			</Alert.Root>
		{:else if receipt.stopped?.kind === 'unconfirmed'}
			<Alert.Root variant="warning">
				<Alert.Title>The last batch was not confirmed</Alert.Title>
			</Alert.Root>
		{/if}
		{#if receipt.refreshError}
			<Alert.Root variant="warning">
				<Alert.Description
					>The import saved, but the page could not refresh. Reload to see the latest records.</Alert.Description
				>
			</Alert.Root>
		{/if}
		<div class="flex flex-wrap gap-2">
			<Button href={session.lane.exit.href} variant="accent">{session.lane.exit.label}</Button>
			<Button variant="outline" onclick={() => session.goTo('file')}>Import another file</Button>
		</div>
	</section>

	{#if receipt.notImported.length}
		<section class="grid content-start gap-3 rounded-md border p-4" aria-labelledby="import-not-imported-heading">
			<h3 id="import-not-imported-heading" class="text-sm font-semibold">
				{plural(receipt.notImported.length, ROWS)} not imported
			</h3>
			<ul class="grid max-h-96 divide-y overflow-y-auto text-sm">
				{#each listed as item (item.row.id)}
					<li class="grid gap-0.5 py-2">
						<span class="flex min-w-0 gap-2">
							<span class="truncate font-medium">
								{session.lane.identity?.label(item.row.raw) || `Row ${item.row.rowNumber}`}
							</span>
							<span class="ml-auto shrink-0 text-xs text-muted-foreground">
								{item.row.sheetName} · row {item.row.rowNumber}
							</span>
						</span>
						<span class="text-xs text-muted-foreground">{item.reason}</span>
					</li>
				{/each}
			</ul>
			{#if receipt.notImported.length > LISTED}
				<p class="text-xs text-muted-foreground">
					{plural(receipt.notImported.length - LISTED, ROWS)} more are in the download.
				</p>
			{/if}
			<Button variant="outline" onclick={() => void session.downloadNotImported()}>
				<DownloadIcon data-icon="inline-start" />
				Download these rows (.xlsx)
			</Button>
			<p class="text-xs text-muted-foreground">
				The download keeps the original columns and adds a Reason column. Fix it and import it again.
			</p>
		</section>
	{/if}
</div>
