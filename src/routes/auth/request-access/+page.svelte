<script lang="ts">
	import AuthField from '$lib/components/auth/AuthField.svelte';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let email = $state('');
	let name = $state('');
	let reason = $state('');
	let loading = $state(false);
	let submitted = $state(false);
	let errorMsg = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading) return;

		errorMsg = '';
		loading = true;

		try {
			const res = await fetch('/api/access-requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, name, reason: reason || undefined })
			});

			if (!res.ok) {
				const data = await res.json();
				errorMsg = data.message || 'Something went wrong. Please try again.';
				return;
			}

			submitted = true;
		} catch {
			errorMsg = 'Something went wrong. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Request Access - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Beta Access"
	title="Request access to the beta."
	description="Submit your information and we'll review your request. Approved users receive an invite link by email."
	panelEyebrow="Beta request"
	panelTitle={submitted ? 'Request submitted' : 'Request beta access'}
	panelDescription={submitted ? 'Your beta request is in the queue.' : 'Tell us who you are and how to reach you.'}
	supportLabel="What this is for"
	supportTitle="Beta access only."
	supportDescription="If you already have an invite code, use Create Account instead. If you already have an account, sign in."
	supportPoints={[
		'Approved users receive a setup link after review.',
		'That setup link expires after 24 hours for security.',
		'Some @army.mil and @health.mil addresses can filter these emails before they reach your inbox.',
		'If you already have an account or invite code, use the other auth routes instead.'
	]}
>
	<div class="flex flex-col gap-5">
		{#if submitted}
			<AuthNotice tone="success" title="We've got your request" centered>
				<p>We'll review your request and email <strong>{email}</strong> if access is approved.</p>
				<p>For security, that invite link will only work for 24 hours once it is sent.</p>
				<p>
					If you're using an <strong>@army.mil</strong> or <strong>@health.mil</strong> address and nothing shows up after
					a few days, try requesting access again with a non-military email while we investigate the filtering issue.
				</p>
			</AuthNotice>

			<div class="flex flex-col gap-3">
				<Button href="/auth/login" class="w-full">Back to sign in</Button>
			</div>
		{:else}
			{#if errorMsg}
				<AuthNotice tone="error" message={errorMsg} />
			{/if}

			<AuthNotice tone="warning" title="Important">
				<p>If your request is approved, the setup link in your email will only be valid for 24 hours.</p>
				<p>That short window is intentional for security, so plan to open it promptly.</p>
				<p>
					We are also investigating an email-delivery issue affecting some <strong>@army.mil</strong> and
					<strong>@health.mil</strong>
					addresses. If you do not receive anything after a few days, try a non-military email address instead.
				</p>
			</AuthNotice>

			<form onsubmit={handleSubmit} class="flex flex-col gap-5">
				<AuthField label="Full Name" id="name" bind:value={name} required placeholder="Your full name" />

				<AuthField
					label="Email Address"
					id="email"
					type="email"
					bind:value={email}
					required
					placeholder="you@example.com"
				/>

				<AuthField
					label="Unit or Reason"
					id="reason"
					inputElement="textarea"
					bind:value={reason}
					rows={4}
					placeholder="Tell us your unit, role, or why you want beta access"
					hint="Optional."
				/>

				<div class="flex flex-col gap-3">
					<Button type="submit" disabled={loading} class="w-full">
						{#if loading}
							<Spinner />
							Submitting...
						{:else}
							Submit Request
						{/if}
					</Button>
				</div>
			</form>

			<div
				class="flex items-center gap-4 font-mono text-[0.6875rem] font-semibold tracking-[0.15em] text-muted-foreground uppercase"
			>
				<span class="h-px flex-1 bg-border"></span>
				<span class="whitespace-nowrap">Other paths</span>
				<span class="h-px flex-1 bg-border"></span>
			</div>

			<div class="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
				<p>
					Have an invite code already? <a href="/auth/register">Create your account</a>.
				</p>
				<p>
					Already active? <a href="/auth/login">Sign in</a>.
				</p>
			</div>
		{/if}
	</div>
</AuthShell>
