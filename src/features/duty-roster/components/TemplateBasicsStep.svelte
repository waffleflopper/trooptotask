<script lang="ts">
	interface Props {
		templateName: string;
		templateDescription: string;
		templateStatus: 'draft' | 'active' | 'archived';
		canSaveDraft: boolean;
		selectedTemplateCanArchive: boolean;
		onNameChange: (value: string) => void;
		onDescriptionChange: (value: string) => void;
		onStatusChange: (value: 'draft' | 'active' | 'archived') => void;
		onNext: () => void;
		onArchive: () => void;
	}

	let {
		templateName,
		templateDescription,
		templateStatus,
		canSaveDraft,
		selectedTemplateCanArchive,
		onNameChange,
		onDescriptionChange,
		onStatusChange,
		onNext,
		onArchive
	}: Props = $props();
</script>

<section class="builder-card">
	<p class="eyebrow">Details</p>
	<div class="form-grid">
		<label class="field">
			<span>Name</span>
			<input
				class="input"
				type="text"
				value={templateName}
				placeholder="e.g. Battalion Staff Duty"
				oninput={(e) => onNameChange((e.currentTarget as HTMLInputElement).value)}
			/>
		</label>

		<label class="field">
			<span>Status</span>
			<select
				class="select"
				value={templateStatus}
				onchange={(e) =>
					onStatusChange((e.currentTarget as HTMLSelectElement).value as 'draft' | 'active' | 'archived')}
			>
				<option value="draft">Draft</option>
				<option value="active">Active</option>
				<option value="archived">Archived</option>
			</select>
		</label>

		<label class="field field-wide">
			<span>Description</span>
			<textarea
				class="input"
				rows="3"
				value={templateDescription}
				placeholder="Optional notes"
				oninput={(e) => onDescriptionChange((e.currentTarget as HTMLTextAreaElement).value)}
			></textarea>
		</label>
	</div>
</section>

<div class="step-actions">
	<button class="btn btn-primary" type="button" disabled={!canSaveDraft} onclick={onNext}>Policy</button>
	{#if selectedTemplateCanArchive}
		<button class="btn btn-danger" type="button" onclick={onArchive}>Archive</button>
	{/if}
</div>

<style>
	.builder-card {
		padding: var(--sp-5);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.eyebrow {
		margin: 0 0 var(--sp-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.form-grid {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	}
	.field {
		display: grid;
		gap: var(--sp-2);
	}
	.field-wide {
		grid-column: 1 / -1;
	}
	.field > span {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.step-actions {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
		margin-top: var(--sp-4);
	}
</style>
