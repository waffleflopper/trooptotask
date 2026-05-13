<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import PenToolIcon from '@lucide/svelte/icons/pen-tool';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let creating = $state(false);
	let error = $state<string | null>(null);

	async function createSandbox() {
		creating = true;
		error = null;

		try {
			const res = await fetch('/api/create-demo-sandbox', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message || 'Failed to create sandbox');
			}

			const { orgId } = await res.json();

			// Close modal and redirect to the sandbox org with full page reload
			// to ensure cookies are picked up properly
			onClose();
			window.location.href = `/org/${orgId}`;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Something went wrong';
			creating = false;
		}
	}
</script>

<AppDialog.Root closeBlocked={creating} {onClose}>
	<AppDialog.Content closeBlocked={creating}>
		<AppDialog.Header>
			<AppDialog.Title>Try Editing</AppDialog.Title>
			<AppDialog.Description>Create a private demo sandbox with sample data.</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="grid gap-4">
			<div class="flex items-start gap-4">
				<div class="grid size-12 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
					<PenToolIcon aria-hidden="true" class="size-7" />
				</div>
				<p class="m-0 text-sm leading-6 text-muted-foreground">
					You're viewing a <strong class="text-foreground">read-only demo</strong>. To try editing, we'll create your
					own private sandbox with sample data.
				</p>
			</div>

			<div class="grid gap-2">
				<div class="flex items-center gap-2 rounded-lg bg-muted p-2 text-sm">
					<CheckIcon aria-hidden="true" class="size-4 shrink-0 text-success" />
					<span>Full editing access</span>
				</div>
				<div class="flex items-center gap-2 rounded-lg bg-muted p-2 text-sm">
					<CheckIcon aria-hidden="true" class="size-4 shrink-0 text-success" />
					<span>Pre-loaded with sample data</span>
				</div>
				<div class="flex items-center gap-2 rounded-lg bg-muted p-2 text-sm">
					<CheckIcon aria-hidden="true" class="size-4 shrink-0 text-success" />
					<span>No sign-up required</span>
				</div>
				<div class="flex items-center gap-2 rounded-lg bg-warning-muted p-2 text-sm text-warning-foreground">
					<ClockIcon aria-hidden="true" class="size-4 shrink-0" />
					<span>Expires after 1 hour</span>
				</div>
			</div>

			{#if error}
				<Alert.Root variant="destructive">
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if !creating}
				<Button type="button" variant="outline" onclick={onClose}>Cancel</Button>
			{/if}
			<Button type="button" onclick={createSandbox} disabled={creating}>
				{#if creating}
					<Spinner />
					Creating your sandbox...
				{:else}
					Create My Sandbox
				{/if}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
