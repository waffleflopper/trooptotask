<script lang="ts">
	import { resolve } from '$app/paths';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let {
		open = $bindable(false),
		orgName,
		orgUrlSegment,
		membershipId
	}: {
		open?: boolean;
		orgName: string;
		orgUrlSegment: string;
		membershipId: string | null;
	} = $props();

	let confirmText = $state('');
	const canSubmit = $derived(Boolean(membershipId) && confirmText === 'YES');

	function close() {
		confirmText = '';
		open = false;
	}
</script>

<AppDialog.Root bind:open onClose={close}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Leave Organization</AppDialog.Title>
			<AppDialog.Description>
				Are you sure you wish to leave {orgName}? You will lose access to this organization's workspace unless you are
				invited again.
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			<form
				id="leave-organization-form"
				method="POST"
				action={resolve(`/org/${orgUrlSegment}?/leaveOrganization` as '/')}
				class="grid gap-3"
				onsubmit={(event) => {
					if (!canSubmit) event.preventDefault();
				}}
			>
				<input type="hidden" name="membershipId" value={membershipId ?? ''} />
				<div class="grid gap-2">
					<Label for="leave-organization-confirm">Type YES to confirm</Label>
					<Input
						id="leave-organization-confirm"
						name="confirmLeaveOrganization"
						type="text"
						bind:value={confirmText}
						autocomplete="off"
						placeholder="YES"
						aria-describedby="leave-organization-help"
					/>
					<p id="leave-organization-help" class="text-sm text-muted-foreground">
						This confirms you understand the action applies to {orgName}.
					</p>
				</div>
				{#if !membershipId}
					<p class="text-sm text-destructive">
						We could not identify your organization membership. Refresh the page and try again.
					</p>
				{/if}
			</form>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button type="button" variant="outline" onclick={close}>Cancel</Button>
			<Button type="submit" form="leave-organization-form" variant="destructive" disabled={!canSubmit}>
				Leave Organization
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
