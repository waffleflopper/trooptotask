<script lang="ts">
	import type { PageProps } from './$types';
	import DataExportSettingsSection from '../DataExportSettingsSection.svelte';
	import { downloadBlob } from '../settingsDownloads';
	import { createSettingsDataExportState } from '../settingsWorkspaceState.svelte';

	let { data }: PageProps = $props();

	const exportState = createSettingsDataExportState(() => data.exportsSettings.sections.exports);
	const dataExportSection = $derived(exportState.section);

	async function handleOrganizationExport(format: 'json' | 'excel') {
		if (exportState.isExporting || exportState.exportLimitReached) return;
		exportState.beginExport(format);
		const endpoint = format === 'json' ? 'export' : 'export-excel';
		const fallbackName = `org-export-${data.orgId}.${format === 'json' ? 'json' : 'xlsx'}`;

		try {
			const res = await fetch(`/org/${data.orgId}/api/${endpoint}`, { method: 'POST' });

			if (!res.ok) {
				if (res.headers.get('Content-Type')?.includes('application/json')) {
					const body = await res.json();
					exportState.markExportFailed(body.error || 'Export failed. Please try again.');
				} else {
					exportState.markExportFailed('Export failed. Please try again.');
				}
				return;
			}

			const blob = await res.blob();
			const disposition = res.headers.get('Content-Disposition');
			const filenameMatch = disposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] ?? fallbackName;
			downloadBlob(blob, filename);
			exportState.markExportSucceeded();
		} catch {
			exportState.markExportFailed('Export failed. Please try again.');
		} finally {
			exportState.finishExport();
		}
	}
</script>

<div class="grid gap-4">
	<DataExportSettingsSection
		section={dataExportSection}
		exportError={exportState.exportError}
		exportSuccess={exportState.exportSuccess}
		exportingOrgJson={exportState.exportingOrgJson}
		exportingOrgExcel={exportState.exportingOrgExcel}
		onExportOrganization={handleOrganizationExport}
	/>
</div>
