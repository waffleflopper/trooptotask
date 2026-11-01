<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import type { PendingErrorReference } from '$lib/stores/errorReportLedger';
	import { toastStore } from '$lib/stores/toast.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';

	interface Props {
		onClose: () => void;
		orgId?: string;
		orgName?: string;
		pageUrl?: string;
		/** Opens the report as a bug about one captured failure; a pending report settles to its reference or to nothing. */
		errorReference?: PendingErrorReference;
	}

	let { onClose, orgId, orgName, pageUrl, errorReference }: Props = $props();

	// The modal mounts per opening, so the failure it reports is fixed for its lifetime.
	const initialReference = untrack(() => errorReference);
	const reportsError = initialReference !== undefined;
	let attachedReference = $state<string | null>(typeof initialReference === 'string' ? initialReference : null);
	let referencePending = $state(typeof initialReference === 'object' && initialReference !== null);
	let category = $state(reportsError ? 'bug' : 'general');
	let message = $state('');
	let submitting = $state(false);
	let submitError = $state('');
	let messageField = $state<HTMLTextAreaElement | null>(null);
	let active = true;
	onDestroy(() => {
		active = false;
	});

	if (initialReference && typeof initialReference !== 'string') {
		void initialReference.then(
			(reference) => {
				if (!active) return;
				attachedReference = reference;
				referencePending = false;
			},
			() => {
				if (!active) return;
				referencePending = false;
			}
		);
	}

	const canSubmit = $derived(message.trim().length > 0 && !referencePending);
	const categoryLocked = $derived(reportsError && (referencePending || attachedReference !== null));
	const categoryLabel = $derived(
		category === 'bug' ? 'Bug Report' : category === 'feature' ? 'Feature Request' : 'General Feedback'
	);

	async function handleSubmit() {
		if (!active || !canSubmit || submitting) return;
		submitting = true;
		submitError = '';
		try {
			const res = await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					category,
					message: message.trim(),
					pageUrl,
					organizationId: orgId,
					organizationName: orgName,
					errorReference: attachedReference ?? undefined
				})
			});
			if (!active) return;

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.message || 'Failed to submit feedback');
			}

			toastStore.success('Feedback submitted — thank you!');
			if (active) onClose();
		} catch (err) {
			if (!active) return;
			submitError = err instanceof Error ? err.message : 'Failed to submit feedback';
			submitting = false;
			await tick();
			messageField?.focus();
		} finally {
			if (active) submitting = false;
		}
	}
</script>

<AppDialog.Root busy={submitting} {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Send Feedback</AppDialog.Title>
			<AppDialog.Description>Share feedback about the current page or workflow.</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="grid gap-4">
			{#if submitError}
				<Alert.Root variant="destructive">
					<Alert.Description>{submitError}</Alert.Description>
				</Alert.Root>
			{/if}
			<div class="grid gap-2">
				<Label for="feedback-category">Category</Label>
				<Select.Root type="single" bind:value={category} disabled={submitting || categoryLocked}>
					<Select.Trigger id="feedback-category" class="w-full">{categoryLabel}</Select.Trigger>
					<Select.Content>
						<Select.Item value="general" label="General Feedback" />
						<Select.Item value="bug" label="Bug Report" />
						<Select.Item value="feature" label="Feature Request" />
					</Select.Content>
				</Select.Root>
			</div>

			{#if reportsError}
				<div class="grid gap-2">
					<Label for="feedback-error-reference">Error reference</Label>
					<Input
						id="feedback-error-reference"
						readonly
						class="font-mono text-xs"
						value={referencePending
							? 'Attaching error details...'
							: (attachedReference ?? 'No error details could be attached')}
					/>
				</div>
			{/if}

			<div class="grid gap-2">
				<Label for="feedback-message">{reportsError ? 'What were you doing?' : 'Message'}</Label>
				<Textarea
					bind:ref={messageField}
					id="feedback-message"
					bind:value={message}
					disabled={submitting}
					rows={5}
					class="min-h-28 resize-y"
					placeholder={reportsError
						? 'What were you doing when this happened?'
						: category === 'bug'
							? 'Describe the bug: what happened, what you expected, and steps to reproduce...'
							: category === 'feature'
								? "Describe the feature you'd like to see..."
								: 'Share your thoughts, suggestions, or feedback...'}
					required
				/>
			</div>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button type="button" variant="outline" onclick={onClose} disabled={submitting}>Cancel</Button>
			<!-- aria-disabled keeps focus on Submit while the request is pending; handleSubmit ignores a repeat press. -->
			<Button
				type="button"
				onclick={handleSubmit}
				disabled={!canSubmit}
				aria-disabled={submitting ? 'true' : undefined}
				aria-busy={submitting || undefined}
			>
				{#if submitting}<Spinner />{/if}
				{submitting ? 'Submitting...' : 'Submit'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
