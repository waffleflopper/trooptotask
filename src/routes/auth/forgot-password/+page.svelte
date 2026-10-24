<script lang="ts">
	import AuthButton from '$features/identity/AuthButton.svelte';
	import AuthField from '$features/identity/AuthField.svelte';
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';

	let { form } = $props();
	let loading = $state(false);
	let confirmation = $state<HTMLElement | null>(null);
	// Only a 400 rejects the email itself; native and enhanced submissions both set the page status.
	const emailError = $derived(page.status === 400 && form?.error ? form.error : '');
</script>

<svelte:head>
	<title>Forgot Password - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Credential Recovery"
	headline={['Locked out?', 'Reset it.']}
	lede="One short detour. Enter your email and the reset link does the rest."
	steps={{
		label: 'How a reset works',
		items: [
			{ title: 'Ask for a link', detail: 'Use the email on your account.' },
			{ title: 'Open the email', detail: 'Check spam if it is slow.' },
			{ title: 'Choose a password', detail: 'Then sign in as usual.' }
		]
	}}
	alternatives={[{ prompt: 'Remembered it?', label: 'Back to sign in', href: resolve('/auth/login') }]}
	panelEyebrow="Recovery"
	panelTitle={form?.success ? 'Check your email' : 'Reset your password'}
	panelDescription={form?.success
		? 'If the account exists, a reset link is on the way.'
		: "Enter the email address tied to your account and we'll send a reset link."}
>
	<div class="flex flex-col gap-5">
		{#if form?.success}
			<AuthNotice bind:ref={confirmation} tone="success" title="Check your email" centered>
				<p>If an account exists for <strong>{form.email}</strong>, a password reset link is on the way.</p>
				<p>Open the message and follow the link to choose a new password.</p>
				<p>If it does not arrive within a few minutes, check your spam folder.</p>
			</AuthNotice>
		{:else}
			{#if form?.error && !emailError}
				<AuthNotice tone="error" message={form.error} />
			{/if}

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
					value={form?.email ?? ''}
					error={emailError}
					required
					autocomplete="email"
				/>

				<AuthButton {loading} loadingLabel="Sending Reset Link...">Send Reset Link</AuthButton>
			</form>
		{/if}
	</div>
</AuthShell>
