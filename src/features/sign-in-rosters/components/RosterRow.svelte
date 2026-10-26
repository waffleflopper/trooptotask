<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { fileDrop } from '$lib/components/patterns/dropzone';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { SENSITIVE_FILE_ACCEPT } from '$lib/storage/sensitiveFiles';
	import { cn } from '$lib/utils';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import type { SignInRoster } from '../sign-in-rosters.types';
	import type { RosterList } from './rosterList.svelte';

	let {
		roster,
		list,
		canEdit,
		onReprint,
		onDelete
	}: {
		roster: SignInRoster;
		list: RosterList;
		canEdit: boolean;
		onReprint: () => void;
		onDelete: () => void;
	} = $props();

	let dragging = $state(false);
	let scanInput = $state<HTMLInputElement | null>(null);

	const uploading = $derived(list.uploading.has(roster.id));
	const removing = $derived(list.removing.has(roster.id));
	const scanError = $derived(list.scanErrors.get(roster.id));
	const fileName = $derived(roster.signedFilePath?.split('/').pop() ?? '');
	const dateLabel = $derived(
		roster.blankDate ? 'Blank date' : roster.rosterDate ? formatDayMonthYear(roster.rosterDate) : 'No date'
	);
	const hasMenu = $derived(canEdit || !!roster.signedFilePath);

	function attach(files: File[]) {
		if (canEdit && files[0]) void list.uploadScan(roster, files[0]);
	}

	function pick(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		const file = input.files?.[0];
		input.value = '';
		if (file) attach([file]);
	}
</script>

<li
	class={cn(
		'relative flex flex-col gap-1.5 border-b border-border px-1 py-4 transition-colors',
		dragging && 'rounded-lg bg-warning-muted outline-1 -outline-offset-1 outline-warning outline-dashed'
	)}
	data-dragging={dragging || undefined}
	{@attach fileDrop({ onFiles: attach, onDraggingChange: (next) => (dragging = next && canEdit) })}
>
	<div class="flex items-center gap-3">
		<div class="min-w-0 flex-1">
			<p class="truncate text-base font-semibold text-foreground">{roster.title}</p>
			<p class="font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase tabular-nums">
				{dateLabel} · {roster.personnelSnapshot.length} personnel
			</p>
		</div>

		<div class="flex shrink-0 items-center gap-2">
			{#if uploading}
				<span class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
					<Spinner class="size-3.5" />
					<span class="max-w-32 truncate">Uploading {list.uploadingNames.get(roster.id) ?? 'signed scan'}…</span>
				</span>
			{:else if dragging}
				<span
					class="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground"
				>
					<UploadIcon aria-hidden="true" class="size-4" />
					Drop to attach
				</span>
			{:else if roster.signedFilePath}
				<Button
					variant="link"
					size="none"
					class="gap-1.5 text-success-foreground underline"
					title={fileName}
					onclick={() => list.downloadScan(roster)}
				>
					<CheckIcon aria-hidden="true" class="size-4" />
					Signed scan
				</Button>
			{:else if canEdit}
				<Button
					variant="outline"
					size="default"
					class="border-dashed border-warning text-warning-foreground hover:bg-warning-muted"
					onclick={() => scanInput?.click()}
				>
					<UploadIcon aria-hidden="true" />
					Add signed scan
				</Button>
			{:else}
				<span class="text-sm text-muted-foreground">No signed scan</span>
			{/if}

			<Button variant="outline" size="icon" aria-label={`Reprint ${roster.title}`} onclick={onReprint}>
				<PrinterIcon aria-hidden="true" />
			</Button>

			{#if hasMenu}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="icon" aria-label={`More actions for ${roster.title}`}>
								<EllipsisIcon aria-hidden="true" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						{#if roster.signedFilePath}
							<DropdownMenu.Item onSelect={() => list.downloadScan(roster)}>Download scan</DropdownMenu.Item>
						{/if}
						{#if canEdit}
							<DropdownMenu.Item disabled={uploading || removing} onSelect={() => scanInput?.click()}>
								{roster.signedFilePath ? 'Replace scan' : 'Add signed scan'}
							</DropdownMenu.Item>
							{#if roster.signedFilePath}
								<DropdownMenu.Item disabled={uploading || removing} onSelect={() => list.removeScan(roster)}>
									Remove scan
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Separator />
							<DropdownMenu.Item variant="destructive" disabled={list.deleting === roster.id} onSelect={onDelete}>
								Delete roster
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
		</div>
	</div>

	{#if canEdit}
		<Input
			bind:ref={scanInput}
			type="file"
			class="sr-only"
			tabindex={-1}
			accept={SENSITIVE_FILE_ACCEPT}
			aria-label={`Signed scan file for ${roster.title}`}
			onchange={pick}
		/>
	{/if}

	{#if scanError}
		<p role="alert" class="text-sm text-destructive-text">{scanError}</p>
	{/if}
</li>
