<script lang="ts">
	import { page } from '$app/stores';
	import Spinner from './Spinner.svelte';

	const supabase = $derived($page.data.supabase);

	interface Props {
		filePath: string | null;
		orgId: string;
		storagePath: string;
		onUpload: (path: string) => void;
		onRemove: () => void;
		accept?: string;
		label?: string;
		disabled?: boolean;
	}

	let {
		filePath,
		orgId,
		storagePath,
		onUpload,
		onRemove,
		accept = 'application/pdf',
		label = 'PDF Document',
		disabled = false
	}: Props = $props();

	let uploading = $state(false);
	let dragOver = $state(false);
	let errorMsg = $state('');

	function sanitizeFilename(name: string): string {
		return name.replace(/[^a-zA-Z0-9._-]/g, '_');
	}

	async function uploadFile(file: File) {
		if (uploading || disabled) return;

		if (accept === 'application/pdf' && file.type !== 'application/pdf') {
			errorMsg = 'Only PDF files are allowed.';
			return;
		}

		if (file.size > 10 * 1024 * 1024) {
			errorMsg = 'File must be under 10MB.';
			return;
		}

		errorMsg = '';
		uploading = true;

		try {
			const path = `${orgId}/${storagePath}/${sanitizeFilename(file.name)}`;
			const { error } = await supabase.storage
				.from('counseling-files')
				.upload(path, file, { upsert: true });

			if (error) throw error;
			onUpload(path);
		} catch (err: any) {
			errorMsg = err.message || 'Upload failed.';
		} finally {
			uploading = false;
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) uploadFile(file);
		input.value = '';
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file) uploadFile(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	async function handleDownload() {
		if (!filePath) return;
		const { data, error } = await supabase.storage
			.from('counseling-files')
			.createSignedUrl(filePath, 60);

		if (error || !data?.signedUrl) {
			errorMsg = 'Could not generate download link.';
			return;
		}
		window.open(data.signedUrl, '_blank');
	}

	async function handleRemove() {
		if (!filePath || disabled) return;
		try {
			await supabase.storage.from('counseling-files').remove([filePath]);
		} catch {
			// Best effort — file may already be gone
		}
		onRemove();
	}

	function getFilename(path: string): string {
		return path.split('/').pop() ?? path;
	}
</script>

<div class="file-upload">
	<label class="label">{label}</label>

	{#if uploading}
		<div class="upload-status">
			<Spinner size={16} color="var(--color-primary)" />
			<span>Uploading...</span>
		</div>
	{:else if filePath}
		<div class="file-info">
			<button class="file-link" onclick={handleDownload} type="button">
				<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
				</svg>
				<span class="file-name">{getFilename(filePath)}</span>
			</button>
			{#if !disabled}
				<button class="btn-remove" onclick={handleRemove} type="button">Remove</button>
			{/if}
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="drop-zone"
			class:drag-over={dragOver}
			class:disabled
			ondrop={handleDrop}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
		>
			<svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="17 8 12 3 7 8" />
				<line x1="12" y1="3" x2="12" y2="15" />
			</svg>
			<span class="drop-text">Drag & drop PDF here or</span>
			<label class="choose-btn btn btn-secondary btn-sm">
				Choose PDF
				<input
					type="file"
					accept={accept}
					onchange={handleFileSelect}
					{disabled}
					hidden
				/>
			</label>
		</div>
	{/if}

	{#if errorMsg}
		<span class="error-msg">{errorMsg}</span>
	{/if}
</div>

<style>
	.file-upload {
		margin-bottom: var(--spacing-md);
	}

	.drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-lg);
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		transition: all 0.15s ease;
		cursor: pointer;
	}

	.drop-zone.drag-over {
		border-color: var(--color-primary);
		background: rgba(63, 81, 181, 0.05);
	}

	.drop-zone.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.upload-icon {
		width: 24px;
		height: 24px;
		color: var(--color-text-muted);
	}

	.drop-text {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.choose-btn {
		cursor: pointer;
	}

	.upload-status {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.file-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.file-link {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		color: var(--color-primary);
		font-size: var(--font-size-sm);
		font-weight: 500;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex: 1;
		min-width: 0;
	}

	.file-link:hover {
		text-decoration: underline;
	}

	.file-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.btn-remove {
		font-size: var(--font-size-xs);
		color: var(--color-error);
		background: none;
		border: none;
		cursor: pointer;
		padding: var(--spacing-xs);
		flex-shrink: 0;
	}

	.btn-remove:hover {
		text-decoration: underline;
	}

	.error-msg {
		display: block;
		margin-top: var(--spacing-xs);
		font-size: var(--font-size-xs);
		color: var(--color-error);
	}
</style>
