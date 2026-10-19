<script lang="ts">
	import { onDestroy } from 'svelte';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { Button } from '$lib/components/ui/button';
	import { CoverageBar } from '$lib/components/patterns/coverage-bar';
	import { formatDayMonth } from '$lib/utils/dates';
	import type { PersonnelCounselingRecord, PersonnelCounselingsRead } from '../contracts';
	import { coverageCaption, coverageMonths, lastCounseledLabel } from '../counselingCoverage';
	import { uploadedOn } from '../fileLabels';
	import { MoreRecords } from '../workspace/moreRecords.svelte';

	let {
		read,
		orgId,
		personnelId,
		asOf,
		timeZone,
		canManage,
		onArchive
	}: {
		read: PersonnelCounselingsRead;
		orgId: string;
		personnelId: string;
		asOf: string;
		/** The viewer's IANA time zone, which decides the day an upload is dated. */
		timeZone: string;
		canManage: boolean;
		onArchive: (record: PersonnelCounselingRecord) => Promise<void>;
	} = $props();

	const base = $derived(`/org/${orgId}/api/personnel/${personnelId}/counseling-records`);
	const more = new MoreRecords<PersonnelCounselingRecord>({
		endpoint: () => base,
		shown: () => read.records.length,
		fetch: (input, init) => fetch(input, init),
		failureMessage: "Couldn't load older counselings. Try again."
	});

	const records = $derived([...read.records, ...more.records]);
	const months = $derived(coverageMonths(asOf, read.coveredMonths));
	const remaining = $derived(Math.max(0, read.total - records.length));
	const lastConducted = $derived(read.records[0]?.dateConducted ?? null);
	let openingId = $state('');
	let archivingId = $state('');
	let error = $state('');
	let alive = true;

	onDestroy(() => {
		alive = false;
	});

	async function open(record: PersonnelCounselingRecord) {
		error = '';
		openingId = record.id;
		try {
			const response = await fetch(`${base}/${record.id}/download`);
			if (!response.ok) throw new Error('Unable to open counseling.');
			const { url } = (await response.json()) as { url: string };
			if (alive) window.open(url, '_blank', 'noopener,noreferrer');
		} catch {
			if (alive) error = 'Unable to open counseling.';
		} finally {
			if (alive) openingId = '';
		}
	}

	async function archive(record: PersonnelCounselingRecord) {
		error = '';
		archivingId = record.id;
		try {
			await onArchive(record);
		} catch {
			if (alive) error = 'Unable to archive counseling.';
		} finally {
			if (alive) archivingId = '';
		}
	}
</script>

<section class="flex flex-col gap-4" aria-labelledby="files-counselings-heading">
	<header class="flex flex-col gap-0.5">
		<p class="font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
			Counselings
		</p>
		<h2 id="files-counselings-heading" class="font-heading text-[34px] leading-9 font-bold text-foreground">
			{lastCounseledLabel(lastConducted, asOf)}
		</h2>
	</header>

	{#if read.total > 0}
		<CoverageBar
			segments={months}
			label="Counseling coverage, last 12 months"
			coveredText="counseling on record"
			gapText="no counseling"
		>
			{coverageCaption(months)}
		</CoverageBar>
	{/if}

	{#if error}
		<p class="text-sm text-danger-foreground" role="alert">{error}</p>
	{/if}

	<div class="overflow-clip rounded-md border">
		{#each records as record (record.id)}
			<article
				class="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-b p-3.5 sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
			>
				<div class="flex flex-col gap-0.5">
					<p class="font-heading text-xl leading-[22px] font-bold text-foreground">
						{formatDayMonth(record.dateConducted)}
					</p>
					<p class="font-mono text-[0.6875rem] leading-[14px] text-muted-foreground">
						{record.dateConducted.slice(0, 4)}
					</p>
				</div>
				<div class="flex min-w-0 flex-col gap-1">
					<h3 class="text-[15px] leading-5 font-semibold text-foreground">{record.title}</h3>
					{#if record.summary}
						<p class="text-sm leading-5 text-secondary-foreground">{record.summary}</p>
					{/if}
					<p class="text-[13px] leading-[18px] text-muted-foreground">
						{#if record.conductedBy}
							Conducted by {record.conductedBy} · uploaded {uploadedOn(record.createdAt, timeZone, asOf)}
						{:else}
							Uploaded by {record.uploadedBy}
						{/if}
					</p>
				</div>
				<div class="col-start-2 flex items-start gap-1.5 sm:col-start-3">
					<Button
						variant="outline"
						size="sm"
						disabled={openingId === record.id}
						aria-label={`Open ${record.title} PDF`}
						onclick={() => open(record)}
					>
						<FileTextIcon class="size-3.5" aria-hidden="true" />
						DA 4856 · PDF
					</Button>
					{#if canManage}
						<Button
							variant="ghost"
							size="icon-sm"
							class="text-muted-foreground"
							disabled={archivingId === record.id}
							aria-label={`Archive ${record.title}`}
							onclick={() => archive(record)}
						>
							<ArchiveIcon class="size-4" aria-hidden="true" />
						</Button>
					{/if}
				</div>
			</article>
		{:else}
			<p class="px-3.5 py-3 text-sm text-muted-foreground">
				No counseling records have been added for this Soldier yet.
			</p>
		{/each}
		{#if remaining > 0 || more.error}
			<div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-2.5 text-sm">
				{#if remaining > 0}
					<Button
						variant="link"
						size="none"
						class="font-medium text-foreground underline underline-offset-4"
						disabled={more.loading}
						onclick={more.load}
					>
						Show {remaining} older {remaining === 1 ? 'counseling' : 'counselings'}
					</Button>
				{/if}
				{#if more.error}
					<span class="text-danger-foreground" role="alert">{more.error}</span>
				{/if}
			</div>
		{/if}
	</div>
</section>
