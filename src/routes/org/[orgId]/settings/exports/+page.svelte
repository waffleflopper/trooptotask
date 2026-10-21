<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SettingsPageHeader } from '$features/organization';
	import type { LayoutData, PageProps } from './$types';
	import { SettingsDataExportWorkspace } from '$features/data-export/index.web';

	// The load's suspended branch types as a string index, which hides the exports layout's data from PageProps.
	let { data }: Omit<PageProps, 'data'> & { data: PageProps['data'] & LayoutData } = $props();

	const unit = $derived(data.orgName ?? 'the unit');
</script>

<SettingsPageHeader
	page="exports"
	subtitle={`Take ${unit}’s data with you. JSON for backups and other systems, Excel for people to read.`}
/>

<PageShell.FactSection>
	<PageShell.FactRow
		variant="display"
		label={`Everything in ${unit}`}
		description="One file with every record the unit owns. Excel gives each area its own named sheet."
	>
		{#snippet details()}
			{#key data.orgId}
				<SettingsDataExportWorkspace
					orgId={data.orgId}
					orgName={data.orgName}
					settings={data.exportsSettings}
					lastExport={data.lastExport}
				/>
			{/key}
		{/snippet}
	</PageShell.FactRow>

	<PageShell.FactRow
		variant="display"
		label="Roster only"
		muted
		description="People and groups, without the rest of the unit. A lighter file for S1 and higher."
	>
		{#snippet control()}
			<span
				class="pt-1.5 font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
			>
				Coming soon
			</span>
		{/snippet}
	</PageShell.FactRow>

	<PageShell.FactRow
		variant="display"
		label="One person"
		description="A single soldier’s workbook. Export it from their record, or from Archives after they leave."
	>
		{#snippet control()}
			<Button variant="link" class="-mr-2" href={`/org/${data.orgUrlSegment}/settings/archives`}>
				Archives
				<ChevronRightIcon data-icon="inline-end" aria-hidden="true" />
			</Button>
		{/snippet}
	</PageShell.FactRow>
</PageShell.FactSection>
