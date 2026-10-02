<script lang="ts">
	import { onDestroy } from 'svelte';
	import DataExportSettingsSection from '../DataExportSettingsSection.svelte';
	import { downloadBlob } from '../settingsDownloads';
	import { createSettingsDataExportState } from '../settingsWorkspaceState.svelte';

	let { orgId }: { orgId: string } = $props();

	let active = true;
	onDestroy(() => {
		active = false;
	});

	const exportState = createSettingsDataExportState();

	async function handleOrganizationExport(format: 'json' | 'excel') {
		if (!active || exportState.isExporting) return;
		exportState.beginExport(format);
		const endpoint = format === 'json' ? 'export' : 'export-excel';
		const fallbackName = `org-export-${orgId}.${format === 'json' ? 'json' : 'xlsx'}`;

		try {
			const res = await fetch(`/org/${orgId}/api/${endpoint}`, { method: 'POST' });

			if (!res.ok) {
				if (res.headers.get('Content-Type')?.includes('application/json')) {
					const body = await res.json();
					if (active) exportState.markExportFailed(body.error || 'Export failed. Please try again.');
				} else {
					if (active) exportState.markExportFailed('Export failed. Please try again.');
				}
				return;
			}

			const blob = await res.blob();
			const disposition = res.headers.get('Content-Disposition');
			const filenameMatch = disposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] ?? fallbackName;
			// An intentionally requested download may finish after leaving this Organization.
			downloadBlob(blob, filename);
			if (active) exportState.markExportSucceeded();
		} catch {
			if (active) exportState.markExportFailed('Export failed. Please try again.');
		} finally {
			if (active) exportState.finishExport();
		}
	}
</script>

<div class="grid gap-4">
	<DataExportSettingsSection
		exportError={exportState.exportError}
		exportSuccess={exportState.exportSuccess}
		exportingOrgJson={exportState.exportingOrgJson}
		exportingOrgExcel={exportState.exportingOrgExcel}
		onExportOrganization={handleOrganizationExport}
	/>
</div>
