<script lang="ts">
	import AuthButton from '$features/identity/AuthButton.svelte';
	import AuthField from '$features/identity/AuthField.svelte';
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';

	let { data, form } = $props();
	let loading = $state(false);
	let confirmation = $state<HTMLElement | null>(null);
	// Only a 400 rejects the email itself; native and enhanced submissions both set the page status.
	const emailError = $derived(page.status === 400 && form?.error ? form.error : '');

	const emailValue = $derived(form?.email ?? data.email ?? '');
</script>

<svelte:head>
	<title>Fresh Setup Link - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Setup Link Recovery"
	headline={['Link expired?', 'Get a fresh one.']}
	lede="Invited or approved but never finished setup? We'll send a new Account Setup Link to the same address."
	steps={{
		label: 'How it works',
		items: [
			{ title: 'Enter your email', detail: 'The one your invitation or approval email went to.' },
			{ title: 'Open the newest email', detail: 'Older unused links stop working.' },
			{ title: 'Finish setup', detail: 'The link works for 14 days.' }
		]
	}}
	alternatives={[
		{ prompt: 'Already set up?', label: 'Sign in', href: resolve('/auth/login') },
		{ prompt: 'Forgot your password?', label: 'Reset your password', href: resolve('/auth/forgot-password') },
		{
			prompt: 'Not invited and never requested access?',
			label: 'Request access',
			href: resolve('/auth/request-access')
		}
	]}
	panelEyebrow="Setup link"
	panelTitle={form?.success ? 'Check your email' : 'Request a fresh setup link'}
	panelDescription={form?.success
		? 'If your invitation or approval is still eligible, a new setup email is on the way.'
		: 'Enter the email address your invitation or approval email was sent to.'}
>
	<div class="flex flex-col gap-5">
		{#if form?.success}
			<AuthNotice bind:ref={confirmation} tone="success" title="Check your email" centered>
				<p>
					If <strong>{form.email}</strong> has an invitation or approval that is still eligible, a fresh setup email is on
					the way.
				</p>
				<p>For security, that new link will expire after 14 days.</p>
			</AuthNotice>
		{:else}
			{#if form?.error && !emailError}
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
						await tick();
						(confirmation ?? document.getElementById('email'))?.focus();
					};
				}}
				class="flex flex-col gap-8"
			>
				<AuthField
					label="Email Address"
					id="email"
					name="email"
					type="email"
					value={emailValue}
					error={emailError}
					required
					autocomplete="email"
				/>

				<AuthButton {loading} loadingLabel="Sending Fresh Setup Link...">Email Me a Fresh Setup Link</AuthButton>
			</form>
		{/if}
	</div>
</AuthShell>
