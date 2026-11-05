<script lang="ts">
	import { SettingsPageHeader, SettingsSkeleton } from '$features/organization';
	import WorkspaceLoadError from '../../WorkspaceLoadError.svelte';
	import type { PageProps } from './$types';
	import type { LogsSettingsData } from '../settingsSectionTypes';
	import AuditLogTable from './AuditLogTable.svelte';

	type LogsPageProps = PageProps & {
		data: PageProps['data'] & {
			logsSettings?: LogsSettingsData;
		};
	};

	let { data }: LogsPageProps = $props();

	const logs = $derived(data.logsSettings ?? null);
	const unit = $derived(data.settingsShell?.organization.name ?? 'the unit');
</script>

<SettingsPageHeader
	page="logs"
	subtitle={`Every change made in ${unit}, newest first. Kept for accountability, even after the records themselves are deleted.`}
/>

{#if logs}
	{#await logs.auditLog}
		<div class="min-w-0" aria-busy="true">
			<p role="status" class="sr-only">Loading the audit log</p>
			<SettingsSkeleton page="logs" />
		</div>
	{:then auditLog}
		<AuditLogTable {auditLog} timeZone={logs.timeZone} today={logs.today} />
	{:catch}
		<WorkspaceLoadError subject="Audit log" />
	{/await}
{:else}
	<section class="grid gap-2" aria-labelledby="audit-log-unavailable-title">
		<h2 id="audit-log-unavailable-title" class="font-heading text-[22px] leading-[26px] font-bold">Audit log</h2>
		<p class="text-sm text-muted-foreground">Organization logs are not available.</p>
	</section>
{/if}
