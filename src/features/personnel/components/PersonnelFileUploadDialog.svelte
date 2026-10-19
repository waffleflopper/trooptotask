<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { fileTypeLabel, formatFileSize } from '../fileLabels';
	import { checkUploadFile, UPLOAD_ACCEPT, withDeclaredType, type UploadKind } from '../fileUploadRules';
	import { ArtifactDraft, type ArtifactDraftDeps } from '../workspace/artifactDraft.svelte';
	import { counselingRecordDraftSpec, documentDraftSpec } from '../workspace/personnelArtifactDraftSpecs';

	let {
		orgId,
		personnelId,
		uploaderLabel,
		initial,
		onClose,
		onUploaded
	}: {
		orgId: string;
		personnelId: string;
		/** The uploader's name, offered as the counseling's conductor. */
		uploaderLabel: string | null;
		/** What the flow opens with: a file from a drop, a kind from `?add=`, or neither. */
		initial: { kind: UploadKind | null; file: File | null };
		onClose: () => void;
		onUploaded: (kind: UploadKind) => void;
	} = $props();

	const context = () => ({ orgId, personId: personnelId });
	let alive = true;
	const draftDeps: ArtifactDraftDeps = {
		context,
		fetch: (input, init) => fetch(input, init),
		isCurrent: () => alive
	};
	const counseling = new ArtifactDraft(counselingRecordDraftSpec, draftDeps);
	const documents = new ArtifactDraft(documentDraftSpec, draftDeps);
	counseling.fields.conductedBy = untrack(() => uploaderLabel) ?? '';
	let conductedByEdited = false;

	let file = $state<File | null>(null);
	let kinds = $state<UploadKind[]>(['counseling', 'document']);
	let kind = $state<UploadKind | null>(untrack(() => initial.kind));
	let fileError = $state('');
	let picker = $state<HTMLInputElement | null>(null);
	let chooseButton = $state<HTMLButtonElement | null>(null);

	const draft = $derived(kind === 'counseling' ? counseling : kind === 'document' ? documents : null);
	const canSubmit = $derived(file !== null && draft !== null && !draft.saving);

	onDestroy(() => {
		alive = false;
	});

	function takeFile(next: File | null) {
		fileError = '';
		if (!next) return;
		const check = checkUploadFile(next);
		if (!check.ok) {
			fileError = check.message;
			file = null;
			kinds = ['counseling', 'document'];
			counseling.selectFile(null);
			documents.selectFile(null);
			return;
		}
		const typed = withDeclaredType(next, check.type);
		file = typed;
		kinds = check.kinds;
		counseling.selectFile(typed);
		documents.selectFile(typed);
		if (kind && !check.kinds.includes(kind)) kind = null;
		if (!kind && check.kinds.length === 1) kind = check.kinds[0];
	}

	takeFile(untrack(() => initial.file));

	$effect(() => {
		if (!file) chooseButton?.focus();
	});

	$effect(() => {
		const label = uploaderLabel;
		if (label && !conductedByEdited) counseling.fields.conductedBy = label;
	});

	function pick(event: Event & { currentTarget: HTMLInputElement }) {
		takeFile(event.currentTarget.files?.[0] ?? null);
		event.currentTarget.value = '';
	}

	async function submit() {
		if (!draft || !file || !kind) return;
		const uploaded = kind;
		if (await draft.submit()) if (alive) onUploaded(uploaded);
	}
</script>

<AppDialog.Root open busy={draft?.saving ?? false} {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Add a file</AppDialog.Title>
			<AppDialog.Description>Pick Counseling or Document for this file.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body>
			<form
				id="personnel-file-upload"
				class="flex flex-col gap-4"
				onsubmit={(event) => {
					event.preventDefault();
					void submit();
				}}
			>
				<fieldset class="contents" disabled={draft?.saving}>
					<Field.Root data-invalid={fileError ? true : undefined}>
						<Field.Title id="upload-file-label">File</Field.Title>
						<input
							bind:this={picker}
							type="file"
							class="sr-only"
							tabindex="-1"
							accept={UPLOAD_ACCEPT}
							aria-labelledby="upload-file-label"
							onchange={pick}
						/>
						{#if file}
							<div class="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
								<p class="min-w-0 text-sm">
									<span class="block truncate font-medium text-foreground">{file.name}</span>
									<span class="text-[13px] text-muted-foreground">
										{fileTypeLabel(file.type)} · {formatFileSize(file.size)}
									</span>
								</p>
								<Button type="button" variant="outline" size="sm" onclick={() => picker?.click()}>Change</Button>
							</div>
						{:else}
							<div>
								<Button
									type="button"
									variant="outline"
									bind:ref={chooseButton}
									aria-describedby="upload-file-hint"
									onclick={() => picker?.click()}
								>
									Choose a file
								</Button>
							</div>
							<Field.Description id="upload-file-hint">PDF, JPG, PNG or HEIC up to 10 MB.</Field.Description>
						{/if}
						{#if fileError}
							<Field.Error>{fileError}</Field.Error>
						{/if}
					</Field.Root>

					<Field.Root>
						<Field.Title id="upload-kind-label">Add it as</Field.Title>
						<ToggleGroup.Root
							type="single"
							aria-labelledby="upload-kind-label"
							bind:value={
								() => kind ?? '', (value) => (kind = value === 'counseling' || value === 'document' ? value : null)
							}
						>
							<ToggleGroup.Item value="counseling" disabled={!kinds.includes('counseling')}>Counseling</ToggleGroup.Item
							>
							<ToggleGroup.Item value="document" disabled={!kinds.includes('document')}>Document</ToggleGroup.Item>
						</ToggleGroup.Root>
						{#if file && !kinds.includes('counseling')}
							<Field.Description>Counselings are PDF only.</Field.Description>
						{/if}
					</Field.Root>

					{#if kind === 'counseling'}
						<Field.Root>
							<Field.Label for="upload-counseling-date">Date conducted</Field.Label>
							<DatePicker id="upload-counseling-date" bind:value={counseling.fields.dateConducted} />
						</Field.Root>
						<Field.Root data-invalid={counseling.fieldError('title') ? true : undefined}>
							<Field.Label for="upload-counseling-title">Title</Field.Label>
							<Input
								id="upload-counseling-title"
								placeholder="Monthly performance counseling"
								bind:value={counseling.fields.title}
							/>
							{#if counseling.fieldError('title')}
								<Field.Error>{counseling.fieldError('title')}</Field.Error>
							{/if}
						</Field.Root>
						<Field.Root>
							<div class="flex justify-between">
								<Field.Label for="upload-counseling-summary">Summary</Field.Label>
								<span class="text-[13px] text-muted-foreground">Optional</span>
							</div>
							<Textarea id="upload-counseling-summary" rows={3} bind:value={counseling.fields.summary} />
						</Field.Root>
						<Field.Root>
							<Field.Label for="upload-counseling-by">Conducted by</Field.Label>
							<Input
								id="upload-counseling-by"
								maxlength={120}
								bind:value={counseling.fields.conductedBy}
								oninput={() => (conductedByEdited = true)}
							/>
						</Field.Root>
					{:else if kind === 'document'}
						<Field.Root data-invalid={documents.fieldError('title') ? true : undefined}>
							<Field.Label for="upload-document-title">Title</Field.Label>
							<Input id="upload-document-title" maxlength={160} bind:value={documents.fields.title} />
							{#if documents.fieldError('title')}
								<Field.Error>{documents.fieldError('title')}</Field.Error>
							{/if}
						</Field.Root>
					{/if}

					{#if draft?.error}
						<Alert.Root variant="destructive" role="alert">
							<Alert.Description class="text-current">{draft.error}</Alert.Description>
						</Alert.Root>
					{/if}
				</fieldset>
			</form>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button type="button" variant="outline" disabled={draft?.saving} onclick={onClose}>Cancel</Button>
			<Button type="submit" form="personnel-file-upload" disabled={!canSubmit}>
				{draft?.saving ? 'Uploading…' : 'Upload'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
