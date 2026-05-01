<script lang="ts">
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let {
		orgId,
		exportInfo,
		exportError,
		exportSuccess,
		exportingOrgJson,
		exportingOrgExcel,
		onExportOrganization
	}: {
		orgId: string;
		exportInfo: {
			exportsUsed: number;
			exportsLimit: number;
			isLimited: boolean;
		};
		exportError: string;
		exportSuccess: boolean;
		exportingOrgJson: boolean;
		exportingOrgExcel: boolean;
		onExportOrganization: (format: 'json' | 'excel') => void;
	} = $props();

	const exportLimitReached = $derived(exportInfo.isLimited && exportInfo.exportsUsed >= exportInfo.exportsLimit);
</script>

<div class="data-export-tab">
	<section class="ledger-section" aria-labelledby="data-export-heading">
		<div class="ledger-heading">
			<span>01</span>
			<h3 id="data-export-heading">Export</h3>
			<p class="state-label">{exportInfo.isLimited ? 'Plan limited' : 'Unlimited exports'}</p>
		</div>

		{#if exportError}<div class="error-message ledger-message">{exportError}</div>{/if}
		{#if exportSuccess}<div class="success-message ledger-message">Export downloaded successfully.</div>{/if}

		<div class="ledger-row">
			<div>
				<p class="field-label">Full organization</p>
				<p class="field-hint">
					JSON for backups and integrations. Excel for a human-readable workbook with named sheets.
				</p>
			</div>
			<div class="export-command-group">
				<button
					class="btn btn-primary btn-sm"
					onclick={() => onExportOrganization('json')}
					disabled={exportingOrgJson || exportingOrgExcel || exportLimitReached}
				>
					{#if exportingOrgJson}<Spinner />{/if}
					{exportingOrgJson ? 'Generating...' : 'Export JSON'}
				</button>
				<button
					class="btn btn-secondary btn-sm"
					onclick={() => onExportOrganization('excel')}
					disabled={exportingOrgJson || exportingOrgExcel || exportLimitReached}
				>
					{#if exportingOrgExcel}<Spinner />{/if}
					{exportingOrgExcel ? 'Generating...' : 'Export Excel'}
				</button>
				<span class="export-help">
					Full organization exports include roster, training, onboarding, calendar, and duty data.
				</span>
			</div>
		</div>

		<div class="ledger-row">
			<div>
				<p class="field-label">Export allowance</p>
				<p class="field-hint">Monthly export limits follow the active subscription tier.</p>
			</div>
			<div class="export-quota">
				{#if exportInfo.isLimited}
					<span class="tier-pill">{exportInfo.exportsUsed} / {exportInfo.exportsLimit} used</span>
					{#if exportLimitReached}
						<p class="export-limit-warning">Export limit reached. Upgrade your plan for unlimited exports.</p>
					{/if}
				{:else}
					<span class="tier-pill">Unlimited exports</span>
				{/if}
			</div>
		</div>

		<div class="ledger-row">
			<div>
				<p class="field-label">Personnel only</p>
				<p class="field-hint">Roster and group data only, without the full organization bundle.</p>
			</div>
			<div class="export-command-group">
				<button
					type="button"
					class="btn btn-secondary btn-sm btn-coming-soon"
					disabled
					title="Coming soon"
					aria-disabled="true"
				>
					Export Roster
					<span>Coming Soon</span>
				</button>
			</div>
		</div>

		<div class="ledger-row">
			<div>
				<p class="field-label">Audit log</p>
				<p class="field-hint">Last 90 days of activity.</p>
			</div>
			<div class="export-command-group">
				<a class="btn btn-secondary btn-sm" href={`/org/${orgId}/settings/audit`}>View Audit Log</a>
				<button
					type="button"
					class="btn btn-secondary btn-sm btn-coming-soon"
					disabled
					title="Coming soon"
					aria-disabled="true"
				>
					Export Audit
					<span>Coming Soon</span>
				</button>
			</div>
		</div>
	</section>
</div>
