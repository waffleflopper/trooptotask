<script lang="ts">
	import DataExportSettingsSection from '../DataExportSettingsSection.svelte';
	import { downloadBlob } from '../settingsDownloads';
	import { createSettingsWorkspaceState } from '../settingsWorkspaceState.svelte';

	let { data } = $props();

	const settingsState = createSettingsWorkspaceState(() => data.workspace);
	const dataExportSection = $derived(settingsState.dataExport.section);

	async function handleOrganizationExport(format: 'json' | 'excel') {
		if (settingsState.dataExport.isExporting || settingsState.dataExport.exportLimitReached) return;
		settingsState.dataExport.beginExport(format);
		const endpoint = format === 'json' ? 'export' : 'export-excel';
		const fallbackName = `org-export-${data.orgId}.${format === 'json' ? 'json' : 'xlsx'}`;

		try {
			const res = await fetch(`/org/${data.orgId}/api/${endpoint}`, { method: 'POST' });

			if (!res.ok) {
				if (res.headers.get('Content-Type')?.includes('application/json')) {
					const body = await res.json();
					settingsState.dataExport.markExportFailed(body.error || 'Export failed. Please try again.');
				} else {
					settingsState.dataExport.markExportFailed('Export failed. Please try again.');
				}
				return;
			}

			const blob = await res.blob();
			const disposition = res.headers.get('Content-Disposition');
			const filenameMatch = disposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] ?? fallbackName;
			downloadBlob(blob, filename);
			settingsState.dataExport.markExportSucceeded();
		} catch {
			settingsState.dataExport.markExportFailed('Export failed. Please try again.');
		} finally {
			settingsState.dataExport.finishExport();
		}
	}
</script>

<DataExportSettingsSection
	orgId={data.orgUrlSegment}
	section={dataExportSection}
	exportError={settingsState.dataExport.exportError}
	exportSuccess={settingsState.dataExport.exportSuccess}
	exportingOrgJson={settingsState.dataExport.exportingOrgJson}
	exportingOrgExcel={settingsState.dataExport.exportingOrgExcel}
	onExportOrganization={handleOrganizationExport}
/>
