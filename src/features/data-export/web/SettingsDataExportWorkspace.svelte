<script lang="ts">
	import { onDestroy } from 'svelte';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { SettingsLanes } from '$features/organization';
	import { downloadBlob } from '$lib/utils/downloadBlob';
	import { formatDate, formatDayMonthYear } from '$lib/utils/dates';
	import type {
		ExportScopeCounts,
		ExportsSettingsData,
		LastExport,
		OrganizationExportFormat
	} from '../exportsSettingsTypes';

	let {
		orgId,
		orgName,
		orgUrlSegment,
		settings
	}: { orgId: string; orgName: string | null; orgUrlSegment: string; settings: ExportsSettingsData } = $props();

	const FORMATS = {
		json: { name: 'JSON', summary: 'For backups and integrations', endpoint: 'export', extension: 'json' },
		excel: { name: 'Excel', summary: 'A workbook people can read', endpoint: 'export-excel', extension: 'xlsx' }
	} as const satisfies Record<OrganizationExportFormat, object>;

	let active = true;
	onDestroy(() => {
		active = false;
	});

	let running = $state<Record<OrganizationExportFormat, boolean>>({ json: false, excel: false });
	let errors = $state<Partial<Record<OrganizationExportFormat, string>>>({});
	let announcement = $state('');
	let exportedHere = $state<LastExport | null>(null);

	const unit = $derived(orgName ?? 'the unit');

	function scopeChips(counts: ExportScopeCounts | null): string[] {
		return [
			'Calendar',
			counts ? `Personnel · ${counts.activePersonnel}` : 'Personnel',
			counts
				? `Training · ${counts.trainingRecords} ${counts.trainingRecords === 1 ? 'record' : 'records'}`
				: 'Training',
			'Onboarding',
			'Sign-in rosters'
		];
	}

	function lastExportLine(last: LastExport): string {
		const at = new Date(last.at);
		const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
		const by = last.actor ? ` by ${last.actor}` : '';
		return `Last export · ${FORMATS[last.format].name} · ${formatDayMonthYear(formatDate(at))}, ${time}${by}`;
	}

	async function startExport(format: OrganizationExportFormat) {
		if (!active || running[format]) return;
		const { name, endpoint, extension } = FORMATS[format];
		const fallbackName = `org-export-${orgId}.${extension}`;
		running[format] = true;
		delete errors[format];
		announcement = `Generating ${name} export...`;
		const fail = (message: string) => {
			if (!active) return;
			errors[format] = message;
			announcement = message;
		};

		try {
			const res = await fetch(`/org/${orgId}/api/${endpoint}`, { method: 'POST' });

			if (!res.ok) {
				const body = res.headers.get('Content-Type')?.includes('application/json') ? await res.json() : null;
				fail(body?.error || `${name} export failed. Please try again.`);
				return;
			}

			const blob = await res.blob();
			const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? fallbackName;
			downloadBlob(blob, filename);
			if (active) {
				announcement = `${name} export downloaded.`;
				exportedHere = { format, at: new Date().toISOString(), actor: 'you' };
			}
		} catch {
			fail(`${name} export failed. Please try again.`);
		} finally {
			if (active) running[format] = false;
		}
	}
</script>

{#snippet chips(counts: ExportScopeCounts | null)}
	<ul class="flex flex-wrap gap-1.5" aria-label={`What an export of ${unit} contains`}>
		{#each scopeChips(counts) as chip (chip)}
			<li class="flex h-6 items-center rounded border border-border bg-muted px-2 font-mono text-[11px] leading-[14px]">
				{chip}
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet tile(format: OrganizationExportFormat)}
	{@const { name, summary } = FORMATS[format]}
	<div class="flex min-w-0 flex-1 items-center gap-4 rounded border border-border bg-card p-4">
		<div class="grid min-w-0 flex-1 gap-0.5">
			<p class="font-heading text-[28px] leading-7 font-extrabold">{name}</p>
			<p class="text-sm text-muted-foreground">{summary}</p>
		</div>
		<!-- The pressed button stays focusable while busy so focus does not fall back to the page. -->
		<Button
			variant={running[format] ? 'outline' : 'default'}
			onclick={() => startExport(format)}
			aria-disabled={running[format] ? 'true' : undefined}
		>
			{#if running[format]}<Spinner role="presentation" aria-hidden="true" />Generating…{:else}Export {name}{/if}
		</Button>
	</div>
{/snippet}

<SettingsLanes.Section>
	<SettingsLanes.Row
		label={`Everything in ${unit}`}
		description="One file with every record the unit owns. Excel gives each area its own named sheet."
	>
		{#snippet details()}
			<div class="grid gap-4">
				{#await settings.scopeCounts}
					<div class="flex flex-wrap gap-1.5" aria-hidden="true">
						{#each ['w-18', 'w-28', 'w-40', 'w-22', 'w-30'] as width, index (index)}
							<Skeleton class={`h-6 ${width}`} />
						{/each}
					</div>
					<span class="sr-only">Counting what an export contains</span>
				{:then counts}
					{@render chips(counts)}
				{:catch}
					{@render chips(null)}
				{/await}
				<div class="flex flex-col gap-3 sm:flex-row">
					{@render tile('json')}
					{@render tile('excel')}
				</div>
				{#each Object.entries(errors) as [format, message] (format)}
					<Alert.Root variant="destructive">
						<Alert.Description>{message}</Alert.Description>
					</Alert.Root>
				{/each}
				<p role="status" class="sr-only">{announcement}</p>
				{#if settings.lastExport}
					{#if exportedHere}
						<p class="font-mono text-xs leading-5 wrap-anywhere text-muted-foreground">
							{lastExportLine(exportedHere)}
						</p>
					{:else}
						{#await settings.lastExport}
							<Skeleton class="h-5 w-80 max-w-full" aria-hidden="true" />
							<span class="sr-only">Loading the last export</span>
						{:then last}
							{#if last}
								<p class="font-mono text-xs leading-5 wrap-anywhere text-muted-foreground">{lastExportLine(last)}</p>
							{/if}
						{:catch}
							<p class="font-mono text-xs leading-5 text-muted-foreground">The last export could not be loaded.</p>
						{/await}
					{/if}
				{/if}
			</div>
		{/snippet}
	</SettingsLanes.Row>

	<SettingsLanes.Row
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
	</SettingsLanes.Row>

	<SettingsLanes.Row
		label="One person"
		description="A single soldier’s workbook. Export it from their record, or from Archives after they leave."
	>
		{#snippet control()}
			<Button variant="link" class="-mr-2" href={`/org/${orgUrlSegment}/settings/archives`}>
				Archives
				<ChevronRightIcon data-icon="inline-end" aria-hidden="true" />
			</Button>
		{/snippet}
	</SettingsLanes.Row>
</SettingsLanes.Section>
