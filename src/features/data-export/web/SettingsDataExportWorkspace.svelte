<script lang="ts">
	import { onDestroy } from 'svelte';
	import DataExportSettingsSection from './DataExportSettingsSection.svelte';
	import { downloadBlob } from '$lib/utils/downloadBlob';

	let { orgId }: { orgId: string } = $props();

	let active = true;
	onDestroy(() => {
		active = false;
	});

	let exportingOrgJson = $state(false);
	let exportingOrgExcel = $state(false);
	let exportError = $state('');
	let exportSuccess = $state(false);

	async function handleOrganizationExport(format: 'json' | 'excel') {
		if (!active || exportingOrgJson || exportingOrgExcel) return;
		exportError = '';
		exportSuccess = false;
		exportingOrgJson = format === 'json';
		exportingOrgExcel = format === 'excel';
		const endpoint = format === 'json' ? 'export' : 'export-excel';
		const fallbackName = `org-export-${orgId}.${format === 'json' ? 'json' : 'xlsx'}`;

		try {
			const res = await fetch(`/org/${orgId}/api/${endpoint}`, { method: 'POST' });

			if (!res.ok) {
				if (res.headers.get('Content-Type')?.includes('application/json')) {
					const body = await res.json();
					if (active) exportError = body.error || 'Export failed. Please try again.';
				} else {
					if (active) exportError = 'Export failed. Please try again.';
				}
				return;
			}

			const blob = await res.blob();
			const disposition = res.headers.get('Content-Disposition');
			const filenameMatch = disposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] ?? fallbackName;
			// An intentionally requested download may finish after leaving this Organization.
			downloadBlob(blob, filename);
			if (active) exportSuccess = true;
		} catch {
			if (active) exportError = 'Export failed. Please try again.';
		} finally {
			if (active) {
				exportingOrgJson = false;
				exportingOrgExcel = false;
			}
		}
	}
</script>

<div class="grid gap-4">
	<DataExportSettingsSection
		{exportError}
		{exportSuccess}
		{exportingOrgJson}
		{exportingOrgExcel}
		onExportOrganization={handleOrganizationExport}
	/>
</div>
