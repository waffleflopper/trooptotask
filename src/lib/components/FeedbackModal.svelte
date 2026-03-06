<script lang="ts">
	import Modal from './Modal.svelte';
	import Spinner from './ui/Spinner.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		onClose: () => void;
		orgId?: string;
		orgName?: string;
		pageUrl?: string;
	}

	let { onClose, orgId, orgName, pageUrl }: Props = $props();

	let category = $state('general');
	let message = $state('');
	let submitting = $state(false);

	const canSubmit = $derived(message.trim().length > 0);

	async function handleSubmit() {
		if (!canSubmit || submitting) return;
		submitting = true;
		try {
			const res = await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					category,
					message: message.trim(),
					pageUrl,
					organizationId: orgId,
					organizationName: orgName
				})
			});

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.message || 'Failed to submit feedback');
			}

			toastStore.success('Feedback submitted — thank you!');
			onClose();
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Failed to submit feedback');
		} finally {
			submitting = false;
		}
	}
</script>

<Modal title="Send Feedback" {onClose} width="480px" titleId="feedback-modal-title" canClose={!submitting}>
	<div class="form-group">
		<label class="label" for="feedback-category">Category</label>
		<select id="feedback-category" class="select" bind:value={category}>
			<option value="general">General Feedback</option>
			<option value="bug">Bug Report</option>
			<option value="feature">Feature Request</option>
		</select>
	</div>

	<div class="form-group">
		<label class="label" for="feedback-message">Message</label>
		<textarea
			id="feedback-message"
			class="input"
			bind:value={message}
			rows="5"
			placeholder={category === 'bug'
				? 'Describe the bug: what happened, what you expected, and steps to reproduce...'
				: category === 'feature'
					? 'Describe the feature you\'d like to see...'
					: 'Share your thoughts, suggestions, or feedback...'}
			required
		></textarea>
	</div>

	{#snippet footer()}
		<button class="btn btn-secondary" onclick={onClose} disabled={submitting}>Cancel</button>
		<button class="btn btn-primary" onclick={handleSubmit} disabled={!canSubmit || submitting}>
			{#if submitting}<Spinner />{/if}
			{submitting ? 'Submitting...' : 'Submit'}
		</button>
	{/snippet}
</Modal>

<style>
	textarea.input {
		resize: vertical;
		min-height: 100px;
		font-family: inherit;
	}
</style>
