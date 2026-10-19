<script lang="ts">
	import { onDestroy } from 'svelte';
	import { afterNavigate, invalidate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Dropzone } from '$lib/components/patterns/dropzone';
	import { Progress } from '$lib/components/ui/progress';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import type {
		PersonnelCounselingRecord,
		PersonnelCounselingsRead,
		PersonnelDocument,
		PersonnelDocumentsRead
	} from '../contracts';
	import { storageCaption, storageFraction } from '../fileLabels';
	import { checkUploadFile, UPLOAD_ACCEPT, uploadIntentFromSearch, type UploadKind } from '../fileUploadRules';
	import { refreshPersonnelDetailCounts } from '../workspace/detailCounts';
	import PersonnelCounselingsSection from './PersonnelCounselingsSection.svelte';
	import PersonnelDocumentsSection from './PersonnelDocumentsSection.svelte';
	import PersonnelFileUploadDialog from './PersonnelFileUploadDialog.svelte';

	let {
		orgId,
		personnelId,
		asOf,
		files,
		canManage
	}: {
		orgId: string;
		personnelId: string;
		/** The viewer's day. */
		asOf: string;
		files: { counselings: Promise<PersonnelCounselingsRead>; documents: Promise<PersonnelDocumentsRead> };
		/** Whether the viewer may add and archive files for this Person. */
		canManage: boolean;
	} = $props();

	const counselings = new StreamedValue(() => files.counselings);
	const documents = new StreamedValue(() => files.documents);
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	let flow = $state<{ id: number; kind: UploadKind | null; file: File | null } | null>(null);
	let dropError = $state<string | null>(null);
	let flowCount = 0;
	let alive = true;

	onDestroy(() => {
		alive = false;
	});

	const uploaderLabel = $derived(
		counselings.current.state === 'ready' ? counselings.current.value.uploaderLabel : null
	);

	afterNavigate(({ to }) => {
		const kind = uploadIntentFromSearch(to?.url.searchParams ?? new URLSearchParams());
		if (kind && canManage) flow = { id: ++flowCount, kind, file: null };
	});

	function offer(dropped: File[]) {
		dropError = null;
		if (dropped.length > 1) {
			dropError = 'Add one file at a time.';
			return;
		}
		const check = checkUploadFile(dropped[0]);
		if (!check.ok) {
			dropError = check.message;
			return;
		}
		flow = { id: ++flowCount, kind: null, file: dropped[0] };
	}

	function closeFlow() {
		flow = null;
		const params = [...new URLSearchParams(window.location.search)];
		const kept = params.filter(([key]) => key !== 'add');
		if (kept.length === params.length) return;
		const path = resolve('/org/[orgId]/personnel/[personnelSlug]/files', {
			orgId: page.params.orgId ?? orgId,
			personnelSlug: page.params.personnelSlug ?? personnelId
		});
		const query = new URLSearchParams(kept).toString();
		replaceState(query ? `${path}?${query}` : path, page.state);
	}

	async function uploaded() {
		closeFlow();
		await invalidate('app:personnel-detail-files');
	}

	async function archive(url: string) {
		const response = await fetch(url, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'archive' })
		});
		if (!response.ok) throw new Error('Unable to archive.');
		if (!alive) return;
		await Promise.all([invalidate('app:personnel-detail-files'), refreshPersonnelDetailCounts()]);
	}

	const archiveCounseling = (record: PersonnelCounselingRecord) =>
		archive(`/org/${orgId}/api/personnel/${personnelId}/counseling-records/${record.id}`);
	const archiveDocument = (record: PersonnelDocument) =>
		archive(`/org/${orgId}/api/personnel/${personnelId}/documents/${record.id}`);
</script>

{#snippet unavailable(label: string)}
	<section class="flex flex-col gap-2" aria-label={label}>
		<h2 class="font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
			{label}
		</h2>
		<p class="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
			Couldn't load {label.toLowerCase()}. Reload the page to try again.
		</p>
	</section>
{/snippet}

{#snippet listSkeleton(label: string, bar: boolean)}
	<section class="flex flex-col gap-4" aria-busy="true" aria-label={label}>
		<div class="flex flex-col gap-1.5">
			<Skeleton class="h-3.5 w-24" />
			<Skeleton class="h-9 w-72 max-w-full" />
		</div>
		{#if bar}
			<div class="flex flex-col gap-2">
				<div class="flex gap-1">
					{#each { length: 12 }, index (index)}
						<div class="flex grow basis-0 flex-col gap-1">
							<Skeleton class="h-2" />
							<Skeleton class="h-3" />
						</div>
					{/each}
				</div>
				<Skeleton class="h-[18px] w-80 max-w-full" />
			</div>
		{/if}
		<div class="overflow-clip rounded-md border">
			{#each { length: 3 }, index (index)}
				<div class="flex items-center gap-4 border-b p-3.5 last:border-b-0">
					<Skeleton class="h-9 w-14" />
					<div class="flex grow flex-col gap-1.5">
						<Skeleton class="h-5 w-56 max-w-full" />
						<Skeleton class="h-[18px] w-40 max-w-full" />
					</div>
					<Skeleton class="hidden h-[30px] w-28 sm:block" />
				</div>
			{/each}
		</div>
	</section>
{/snippet}

<div class="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
	<div class="flex min-w-0 flex-col gap-10">
		{#if counselings.current.state === 'ready'}
			{#key counselings.current.value}
				<PersonnelCounselingsSection
					read={counselings.current.value}
					{orgId}
					{personnelId}
					{asOf}
					{timeZone}
					{canManage}
					onArchive={archiveCounseling}
				/>
			{/key}
		{:else if counselings.current.state === 'failed'}
			{@render unavailable('Counselings')}
		{:else}
			{@render listSkeleton('Counselings', true)}
		{/if}

		{#if documents.current.state === 'ready'}
			{#key documents.current.value}
				<PersonnelDocumentsSection
					read={documents.current.value}
					{orgId}
					{personnelId}
					{timeZone}
					{canManage}
					onArchive={archiveDocument}
				/>
			{/key}
		{:else if documents.current.state === 'failed'}
			{@render unavailable('Documents')}
		{:else}
			{@render listSkeleton('Documents', false)}
		{/if}
	</div>

	<aside class="flex min-w-0 flex-col gap-7 lg:self-start">
		{#if canManage}
			<Dropzone
				title="Drop files to upload"
				hint="PDF, JPG, PNG or HEIC up to 10 MB. You'll pick Counseling or Document next."
				accept={UPLOAD_ACCEPT}
				error={dropError}
				onFiles={offer}
			/>
		{/if}
		{#if documents.current.state === 'ready'}
			{@const { usedBytes, capBytes } = documents.current.value}
			<div class="flex flex-col gap-2 px-1">
				<div class="flex items-baseline justify-between gap-3">
					<h2
						class="font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
					>
						Storage
					</h2>
					<p class="font-mono text-xs leading-4 text-secondary-foreground">{storageCaption(usedBytes, capBytes)}</p>
				</div>
				<Progress
					value={Math.round(storageFraction(usedBytes, capBytes) * 100)}
					max={100}
					aria-label="Document storage used"
				/>
			</div>
		{:else if documents.current.state === 'pending'}
			<div class="flex flex-col gap-2 px-1" aria-busy="true" aria-label="Storage">
				<Skeleton class="h-3.5 w-full" />
				<Skeleton class="h-1.5 w-full" />
			</div>
		{/if}
	</aside>
</div>

{#if flow}
	{#key flow.id}
		<PersonnelFileUploadDialog
			{orgId}
			{personnelId}
			{uploaderLabel}
			initial={{ kind: flow.kind, file: flow.file }}
			onClose={closeFlow}
			onUploaded={uploaded}
		/>
	{/key}
{/if}
