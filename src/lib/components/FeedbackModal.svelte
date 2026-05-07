<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';

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
	const categoryLabel = $derived(
		category === 'bug' ? 'Bug Report' : category === 'feature' ? 'Feature Request' : 'General Feedback'
	);

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

<Dialog.Root open onOpenChange={(open) => !open && !submitting && onClose()}>
	<Dialog.Content showCloseButton={!submitting}>
		<Dialog.Header>
			<Dialog.Title>Send Feedback</Dialog.Title>
		</Dialog.Header>

		<div class="grid gap-4">
			<div class="grid gap-2">
				<Label for="feedback-category">Category</Label>
				<Select.Root type="single" bind:value={category}>
					<Select.Trigger id="feedback-category" class="w-full">{categoryLabel}</Select.Trigger>
					<Select.Content>
						<Select.Item value="general" label="General Feedback" />
						<Select.Item value="bug" label="Bug Report" />
						<Select.Item value="feature" label="Feature Request" />
					</Select.Content>
				</Select.Root>
			</div>

			<div class="grid gap-2">
				<Label for="feedback-message">Message</Label>
				<Textarea
					id="feedback-message"
					bind:value={message}
					rows={5}
					class="min-h-28 resize-y"
					placeholder={category === 'bug'
						? 'Describe the bug: what happened, what you expected, and steps to reproduce...'
						: category === 'feature'
							? "Describe the feature you'd like to see..."
							: 'Share your thoughts, suggestions, or feedback...'}
					required
				/>
			</div>
		</div>

		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={onClose} disabled={submitting}>Cancel</Button>
			<Button type="button" onclick={handleSubmit} disabled={!canSubmit || submitting}>
				{#if submitting}<Spinner />{/if}
				{submitting ? 'Submitting...' : 'Submit'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
