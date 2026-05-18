<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let { data, form } = $props();
	let loading = $state(false);

	const emailValue = $derived(form?.email ?? data.email ?? '');
</script>

<svelte:head>
	<title>Fresh Setup Link - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Setup Link Recovery"
	title="Need a fresh setup link?"
	description="If your original setup email expired, we can send a new one for any approved request that still has not been completed."
	panelEyebrow="Setup link"
	panelTitle={form?.success ? 'Check your email' : 'Request a fresh setup link'}
	panelDescription={form?.success
		? 'If your request is still eligible, a new setup email is on the way.'
		: 'Enter the same email address you used on your access request.'}
	supportLabel="Before you send it"
	supportTitle="This only works for approved requests."
	supportDescription="For security, we only resend setup emails for approved access requests that have not already been finished."
	supportPoints={[
		'Use the same email address that received the original approval.',
		'Fresh setup links expire after 14 days, so use the newest email.',
		'If your account is already set up, use reset password instead.'
	]}
>
	<div class="flex flex-col gap-5">
		{#if form?.success}
			<AuthNotice tone="success" title="Check your email" centered>
				<p>
					If <strong>{form.email}</strong> still has an approved, incomplete request, a fresh setup email is on the way.
				</p>
				<p>For security, that new link will expire after 14 days.</p>
			</AuthNotice>
		{:else}
			{#if form?.error}
				<AuthNotice tone="error" message={form.error} />
			{/if}

			<AuthNotice tone="warning" title="14-day setup window">
				<p>Approved Account Setup Links stay valid for 14 days.</p>
				<p>If you receive a new one, use the newest email because older unused links are replaced.</p>
			</AuthNotice>

			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="flex flex-col gap-5"
			>
				<AuthField
					label="Email Address"
					id="email"
					name="email"
					type="email"
					value={emailValue}
					required
					placeholder="you@example.com"
				/>

				<div class="flex flex-col gap-3">
					<Button type="submit" disabled={loading} class="w-full">
						{#if loading}
							<Spinner />
							Sending Fresh Setup Link...
						{:else}
							Email Me a Fresh Setup Link
						{/if}
					</Button>
				</div>
			</form>
		{/if}

		<div
			class="flex items-center gap-4 font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
		>
			<span class="h-px flex-1 bg-border"></span>
			<span class="whitespace-nowrap">Need a different route?</span>
			<span class="h-px flex-1 bg-border"></span>
		</div>

		<div class="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
			<p>
				Already set up? <a href={resolve('/auth/login')}>Sign in</a>.
			</p>
			<p>
				Account active but password forgotten? <a href={resolve('/auth/forgot-password')}>Reset your password</a>.
			</p>
			<p>
				Still waiting on approval? <a href={resolve('/auth/request-access')}>Request access</a>.
			</p>
		</div>
	</div>
</AuthShell>
