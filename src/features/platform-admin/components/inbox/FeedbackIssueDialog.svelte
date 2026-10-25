<script lang="ts">
	import { untrack } from 'svelte';
	import type { FeedbackIssue, FeedbackIssuePrefill } from '$features/feedback/contracts';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';

	interface Props {
		prefill: FeedbackIssuePrefill;
		/** Null when the feedback was sent outside an Organization, so there is nothing to add. */
		organizationName: string | null;
		pending: boolean;
		/** An earlier command may have committed and the item is still reloading, so nothing can be sent yet. */
		held: boolean;
		error: string | null;
		/** GitHub made this issue but the feedback did not save its link: show it instead of offering to create another. */
		unlinked: FeedbackIssue | null;
		onSubmit: (issue: { title: string; description: string; includeOrganization: boolean }) => void;
		onClose: () => void;
	}

	let { prefill, organizationName, pending, held, error, unlinked, onSubmit, onClose }: Props = $props();

	// The draft starts from the prefill once, so a reload behind the dialog never rewrites what is being edited.
	let title = $state(untrack(() => prefill.title));
	let description = $state(untrack(() => prefill.description));
	let includeOrganization = $state(false);

	const canSubmit = $derived(title.trim().length > 0 && description.trim().length > 0 && !pending && !held);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (canSubmit) onSubmit({ title, description, includeOrganization });
	}
</script>

<AppDialog.Root open voice="editorial" busy={pending} {onClose}>
	<AppDialog.Content size="wide">
		<AppDialog.Header>
			<AppDialog.Title>New GitHub issue</AppDialog.Title>
			<AppDialog.Description class="font-mono text-xs">
				waffleflopper/trooptotask · public repository
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body>
			{#if unlinked}
				<Alert.Root variant="destructive" role="alert">
					<Alert.Description>
						{error}
						<a class="mt-1 block font-medium underline" href={unlinked.issueUrl} target="_blank" rel="noreferrer">
							Open issue #{unlinked.issueNumber} on GitHub
						</a>
					</Alert.Description>
				</Alert.Root>
			{:else}
				<form id="feedback-issue-form" class="grid gap-4" onsubmit={submit}>
					<fieldset class="grid gap-4" disabled={pending}>
						<Field.Root>
							<Field.Label for="feedback-issue-title">Title</Field.Label>
							<Field.Control>
								<Input id="feedback-issue-title" maxlength={256} bind:value={title} />
							</Field.Control>
						</Field.Root>
						<Field.Root>
							<Field.Label for="feedback-issue-description">Description</Field.Label>
							<Field.Control>
								<Textarea
									id="feedback-issue-description"
									class="min-h-40 font-mono text-xs"
									maxlength={20000}
									bind:value={description}
								/>
							</Field.Control>
						</Field.Root>
						<div class="grid gap-1.5">
							<p class="text-sm font-medium">Labels</p>
							<ul class="flex flex-wrap gap-1.5" aria-label="Labels">
								{#each prefill.labels as label (label)}
									<li class="rounded-md border border-border px-2 py-0.5 font-mono text-xs">{label}</li>
								{/each}
							</ul>
							<p class="text-[13px] leading-[19px] text-muted-foreground">
								Labels come from the category the person chose.
							</p>
						</div>
						<div class="grid gap-2.5 rounded-lg bg-muted px-3.5 py-3">
							<p class="text-sm leading-5">
								Left out because the repository is public: their name, email{organizationName
									? ' and Organization'
									: ''}.
							</p>
							{#if organizationName}
								<Field.Root orientation="horizontal">
									<Checkbox id="feedback-issue-organization" bind:checked={includeOrganization} />
									<Field.Content>
										<Field.Label for="feedback-issue-organization">Include the Organization name</Field.Label>
										{#if includeOrganization}
											<Field.Description>
												Adds “Organization: {organizationName}” to the end of the issue.
											</Field.Description>
										{/if}
									</Field.Content>
								</Field.Root>
							{/if}
						</div>
					</fieldset>
				</form>
				{#if error}
					<Alert.Root variant="destructive" class="mt-3">
						<Alert.Description>{error}</Alert.Description>
					</Alert.Root>
				{/if}
			{/if}
		</AppDialog.Body>
		<AppDialog.Footer class="sm:items-center">
			{#if unlinked}
				<Button variant="outline" onclick={onClose}>Done</Button>
			{:else}
				<p class="text-[13px] leading-[19px] text-muted-foreground sm:mr-auto">
					The feedback links to the issue and stays open until you close it.
				</p>
				<Button variant="outline" disabled={pending} onclick={onClose}>Cancel</Button>
				<Button
					type="submit"
					form="feedback-issue-form"
					aria-disabled={!canSubmit ? 'true' : undefined}
					aria-busy={pending || undefined}
				>
					{#if pending}<Spinner />{/if}
					Create issue
				</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
