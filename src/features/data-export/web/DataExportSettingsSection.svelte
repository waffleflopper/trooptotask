<script lang="ts">
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

	let {
		exportError,
		exportSuccess,
		exportingOrgJson,
		exportingOrgExcel,
		onExportOrganization
	}: {
		exportError: string;
		exportSuccess: boolean;
		exportingOrgJson: boolean;
		exportingOrgExcel: boolean;
		onExportOrganization: (format: 'json' | 'excel') => void;
	} = $props();

	const busy = $derived(exportingOrgJson || exportingOrgExcel);
	const status = $derived(
		exportingOrgJson
			? 'Generating JSON export...'
			: exportingOrgExcel
				? 'Generating Excel export...'
				: exportSuccess
					? 'Export downloaded successfully.'
					: ''
	);
</script>

{#snippet exportButton(format: 'json' | 'excel', label: string, exporting: boolean)}
	<!-- The pressed button stays focusable while busy so focus does not fall back to the page. -->
	<Button
		size="sm"
		variant={format === 'json' ? 'default' : 'outline'}
		class="aria-disabled:opacity-50"
		onclick={() => onExportOrganization(format)}
		disabled={busy && !exporting}
		aria-disabled={exporting ? 'true' : undefined}
	>
		{#if exporting}<Spinner role="presentation" aria-hidden="true" />{/if}
		{exporting ? 'Generating...' : label}
	</Button>
{/snippet}

<div class="grid gap-4">
	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="data-export-heading">
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h2 id="data-export-heading" class="font-heading text-lg font-semibold tracking-tight">Export</h2>
				<p class="text-sm text-muted-foreground">
					Move data in and out of T2T. JSON for backups, Excel for human review.
				</p>
			</div>
		</div>
		<Separator />

		{#if exportError}
			<Alert.Root variant="destructive">
				<Alert.Description>{exportError}</Alert.Description>
			</Alert.Root>
		{/if}

		<div class="grid gap-4 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
			<div class="grid gap-1">
				<p class="text-sm font-medium">Full organization</p>
				<p class="text-sm text-muted-foreground">
					JSON for backups and integrations. Excel for a human-readable workbook with named sheets.
				</p>
				<p class="text-sm text-muted-foreground">
					Includes Calendar, personnel, training, onboarding, and sign-in rosters.
				</p>
				<p role="status" class="text-sm font-medium">{status}</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				{@render exportButton('json', 'Export JSON', exportingOrgJson)}
				{@render exportButton('excel', 'Export Excel', exportingOrgExcel)}
			</div>
		</div>

		<div class="grid gap-4 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
			<div class="grid gap-1">
				<p class="text-sm font-medium">Personnel only</p>
				<p class="text-sm text-muted-foreground">Roster and group data only, without the full organization bundle.</p>
			</div>
			<div>
				<Button type="button" variant="outline" size="sm" disabled title="Coming soon" aria-disabled="true">
					Export Roster
					<Badge variant="outline">Coming Soon</Badge>
				</Button>
			</div>
		</div>
	</section>
</div>
