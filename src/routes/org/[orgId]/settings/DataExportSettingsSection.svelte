<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import type { SettingsExportsSectionData } from './settingsSectionTypes';

	let {
		orgId,
		section,
		exportError,
		exportSuccess,
		exportingOrgJson,
		exportingOrgExcel,
		onExportOrganization
	}: {
		orgId: string;
		section: SettingsExportsSectionData;
		exportError: string;
		exportSuccess: boolean;
		exportingOrgJson: boolean;
		exportingOrgExcel: boolean;
		onExportOrganization: (format: 'json' | 'excel') => void;
	} = $props();

	const exportInfo = $derived(section.exportInfo);
	const exportLimitReached = $derived(exportInfo.limitReached);
	const logsHref = $derived(resolve(`/org/${orgId}/settings/logs`));
</script>

<div class="grid gap-4">
	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="data-export-heading">
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h2 id="data-export-heading" class="font-heading text-lg font-semibold tracking-tight">Export</h2>
				<p class="text-sm text-muted-foreground">
					Move data in and out of T2T. JSON for backups, Excel for human review.
				</p>
			</div>
			<Badge variant="outline">{exportInfo.isLimited ? 'Plan limited' : 'Unlimited exports'}</Badge>
		</div>
		<Separator />

		{#if exportError}<p class="text-sm text-destructive">{exportError}</p>{/if}
		{#if exportSuccess}<p class="text-sm text-muted-foreground">Export downloaded successfully.</p>{/if}

		<div class="grid gap-4 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
			<div class="grid gap-1">
				<p class="text-sm font-medium">Full organization</p>
				<p class="text-sm text-muted-foreground">
					JSON for backups and integrations. Excel for a human-readable workbook with named sheets.
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					onclick={() => onExportOrganization('json')}
					disabled={exportingOrgJson || exportingOrgExcel || exportLimitReached || !section.commands.canExportJson}
				>
					{#if exportingOrgJson}<Spinner />{/if}
					{exportingOrgJson ? 'Generating...' : 'Export JSON'}
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={() => onExportOrganization('excel')}
					disabled={exportingOrgJson || exportingOrgExcel || exportLimitReached || !section.commands.canExportExcel}
				>
					{#if exportingOrgExcel}<Spinner />{/if}
					{exportingOrgExcel ? 'Generating...' : 'Export Excel'}
				</Button>
				<span class="basis-full text-sm text-muted-foreground">
					Full organization exports include roster, training, onboarding, calendar, and duty data.
				</span>
			</div>
		</div>

		<div class="grid gap-4 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
			<div class="grid gap-1">
				<p class="text-sm font-medium">Export allowance</p>
				<p class="text-sm text-muted-foreground">Monthly export limits follow the active subscription tier.</p>
			</div>
			<div class="grid gap-1">
				{#if exportInfo.isLimited}
					<Badge variant="outline">{exportInfo.exportsUsed} / {exportInfo.exportsLimit} used</Badge>
					{#if exportLimitReached}
						<p class="text-sm text-destructive">Export limit reached. Upgrade your plan for unlimited exports.</p>
					{/if}
				{:else}
					<Badge variant="outline">Unlimited exports</Badge>
				{/if}
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

		<div class="grid gap-4 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
			<div class="grid gap-1">
				<p class="text-sm font-medium">Audit log</p>
				<p class="text-sm text-muted-foreground">Last 90 days of activity.</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button href={logsHref} variant="outline" size="sm">View Audit Log</Button>
				<Button type="button" variant="outline" size="sm" disabled title="Coming soon" aria-disabled="true">
					Export Audit
					<Badge variant="outline">Coming Soon</Badge>
				</Button>
			</div>
		</div>
	</section>
</div>
