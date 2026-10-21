<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
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
	import { PDF_OR_PHOTO_ACCEPT } from '$lib/storage/pdfOrPhotoFiles';
	import { checkUploadFile, uploadIntentFromSearch, type UploadKind } from '../fileUploadRules';
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
		asOf: string;
		files: { counselings: Promise<PersonnelCounselingsRead>; documents: Promise<PersonnelDocumentsRead> };
		canManage: boolean;
	} = $props();

	const counselings = new StreamedValue(() => files.counselings);
	const documents = new StreamedValue(() => files.documents);
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	/** `fromUrl` marks a flow the address names, so Back closes it with the intent. */
	let flow = $state<{ id: number; kind: UploadKind | null; file: File | null; fromUrl: boolean } | null>(null);
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
		if (kind && canManage) flow = { id: ++flowCount, kind, file: null, fromUrl: true };
		else if (!kind && flow?.fromUrl) flow = null;
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
		flow = { id: ++flowCount, kind: null, file: dropped[0], fromUrl: false };
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

<!-- One record at its loaded row's height, close to the empty state's when there are none. -->
{#snippet listSkeleton(label: string, row: Snippet)}
	<section class="flex flex-col gap-4" aria-busy="true" aria-label={label}>
		<div class="flex flex-col gap-0.5">
			<Skeleton class="h-3.5 w-24" />
			<Skeleton class="h-9 w-72 max-w-full" />
		</div>
		<div class="overflow-clip rounded-md border">{@render row()}</div>
	</section>
{/snippet}

{#snippet counselingSkeleton()}
	<div
		class="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-b p-3.5 sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
	>
		<Skeleton class="h-[38px] w-14" />
		<div class="flex flex-col gap-1">
			<Skeleton class="h-5 w-56 max-w-full" />
			<Skeleton class="h-[18px] w-40 max-w-full" />
		</div>
		<Skeleton class="col-start-2 h-7 w-28 sm:col-start-3" />
	</div>
{/snippet}

{#snippet documentSkeleton()}
	<div class="flex h-[41px] items-center border-b px-2"><Skeleton class="h-4 w-12" /></div>
	<div class="flex items-center justify-between gap-4 p-2">
		<div class="flex flex-col gap-0.5">
			<Skeleton class="h-5 w-56 max-w-full" />
			<Skeleton class="h-[18px] w-40 max-w-full sm:hidden" />
		</div>
		<Skeleton class="h-7 w-16" />
	</div>
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
			{@render listSkeleton('Counselings', counselingSkeleton)}
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
			{@render listSkeleton('Documents', documentSkeleton)}
		{/if}
	</div>

	<aside class="flex min-w-0 flex-col gap-7 lg:self-start">
		{#if canManage}
			<Dropzone
				title="Drop files to upload"
				hint="PDF, JPG, PNG or HEIC up to 10 MB. You'll pick Counseling or Document next."
				accept={PDF_OR_PHOTO_ACCEPT}
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
