<script lang="ts">
	import { onDestroy } from 'svelte';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import { cn } from '$lib/utils';
	import type { PersonnelDocument, PersonnelDocumentsRead } from '../contracts';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import { fileTypeLabel, formatFileSize, viewerDay } from '../fileLabels';
	import { MoreRecords } from '../workspace/moreRecords.svelte';

	let {
		read,
		orgId,
		personnelId,
		timeZone,
		canManage,
		onArchive
	}: {
		read: PersonnelDocumentsRead;
		orgId: string;
		personnelId: string;
		/** The viewer's IANA time zone, which decides the day an upload is dated. */
		timeZone: string;
		canManage: boolean;
		onArchive: (record: PersonnelDocument) => Promise<void>;
	} = $props();

	const base = $derived(`/org/${orgId}/api/personnel/${personnelId}/documents`);
	const more = new MoreRecords<PersonnelDocument>({
		endpoint: () => base,
		shown: () => read.records.length,
		fetch: (input, init) => fetch(input, init),
		failureMessage: "Couldn't load more documents. Try again."
	});

	const records = $derived([...read.records, ...more.records]);
	const remaining = $derived(Math.max(0, read.total - records.length));
	let openingId = $state('');
	let archivingId = $state('');
	let error = $state('');
	let alive = true;

	const labelClass =
		'font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase';

	onDestroy(() => {
		alive = false;
	});

	async function open(record: PersonnelDocument) {
		error = '';
		openingId = record.id;
		try {
			const response = await fetch(`${base}/${record.id}/download`);
			if (!response.ok) throw new Error('Unable to open document.');
			const { url } = (await response.json()) as { url: string };
			if (alive) window.open(url, '_blank', 'noopener,noreferrer');
		} catch {
			if (alive) error = 'Unable to open document.';
		} finally {
			if (alive) openingId = '';
		}
	}

	async function archive(record: PersonnelDocument) {
		error = '';
		archivingId = record.id;
		try {
			await onArchive(record);
		} catch {
			if (alive) error = 'Unable to archive document.';
		} finally {
			if (alive) archivingId = '';
		}
	}
</script>

<section class="flex flex-col gap-4" aria-labelledby="files-documents-heading">
	<header class="flex flex-col gap-0.5">
		<p class={labelClass}>Documents</p>
		<h2 id="files-documents-heading" class="font-heading text-[34px] leading-9 font-bold text-foreground">
			{read.total === 0 ? 'No documents' : read.total === 1 ? '1 document' : `${read.total} documents`}
		</h2>
	</header>

	{#if error}
		<p class="text-sm text-danger-foreground" role="alert">{error}</p>
	{/if}

	<div class="overflow-clip rounded-md border">
		<Table.Root>
			<Table.Header class="bg-muted">
				<Table.Row class="hover:bg-transparent">
					<Table.Head class={cn('h-auto py-2 pl-3.5', labelClass)}>Title</Table.Head>
					<Table.Head class={cn('hidden h-auto w-[110px] py-2 pl-4 sm:table-cell', labelClass)}>File</Table.Head>
					<Table.Head class={cn('hidden h-auto w-[170px] py-2 pl-4 sm:table-cell', labelClass)}>Uploaded</Table.Head>
					<Table.Head class="h-auto w-24 py-2 pr-3.5 pl-4"><span class="sr-only">Actions</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each records as record (record.id)}
					<Table.Row>
						<Table.Cell class="py-3 pl-3.5 whitespace-normal">
							<span class="block text-[15px] leading-5 font-medium text-foreground">{record.title}</span>
							<span class="mt-0.5 block text-[13px] leading-[18px] text-muted-foreground sm:hidden">
								{fileTypeLabel(record.contentType)} · {formatFileSize(record.fileSizeBytes)} · {formatDayMonthYear(
									viewerDay(record.createdAt, timeZone)
								)} · {record.uploadedBy}
							</span>
						</Table.Cell>
						<Table.Cell class="hidden pl-4 font-mono text-xs text-muted-foreground sm:table-cell">
							{fileTypeLabel(record.contentType)} · {formatFileSize(record.fileSizeBytes)}
						</Table.Cell>
						<Table.Cell class="hidden pl-4 text-sm text-secondary-foreground sm:table-cell">
							{formatDayMonthYear(viewerDay(record.createdAt, timeZone))} · {record.uploadedBy}
						</Table.Cell>
						<Table.Cell class="pr-3.5 pl-4">
							<div class="flex items-center justify-end gap-1">
								<Button
									variant="link"
									size="none"
									class="text-foreground underline underline-offset-4"
									disabled={openingId === record.id}
									aria-label={`Open ${record.title}`}
									onclick={() => open(record)}
								>
									Open
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
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={4} class="px-3.5 py-3 text-sm whitespace-normal text-muted-foreground">
							No documents have been uploaded for this Soldier yet.
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
		{#if remaining > 0 || more.error}
			<div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3.5 py-2.5 text-sm">
				{#if remaining > 0}
					<Button
						variant="link"
						size="none"
						class="font-medium text-foreground underline underline-offset-4"
						disabled={more.loading}
						onclick={more.load}
					>
						Show {remaining} more
					</Button>
				{/if}
				{#if more.error}
					<span class="text-danger-foreground" role="alert">{more.error}</span>
				{/if}
			</div>
		{/if}
	</div>
</section>
