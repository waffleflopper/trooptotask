<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let loading = $state(false);
	const canSubmit = $derived(data.emailConfirmed && data.canCreate && !loading);
	const statusMessage = $derived(!data.emailConfirmed ? 'Email confirmation required' : data.canCreateMessage);
</script>

<svelte:head>
	<title>Create Your Organization - Troop to Task</title>
</svelte:head>

<div class="create-page">
	<div class="create-card">
		<div class="card-intro">
			<p class="eyebrow">First Organization Setup</p>
			<h1>{data.emailConfirmed ? 'Create your first Organization' : 'Confirm your email first'}</h1>
			<p class="subtitle">
				{#if data.emailConfirmed}
					Stand up the workspace your unit will use for rosters, schedules, readiness, and first-run setup.
				{:else}
					Open the newest confirmation email{data.userEmail ? ` for ${data.userEmail}` : ''} before creating a workspace.
				{/if}
			</p>
		</div>

		<form
			method="POST"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
		>
			{#if form?.error}
				<div class="error-message">{form.error}</div>
			{/if}

			{#if statusMessage}
				<div class="status-message" data-testid="org-new-status">
					<p class="seed-label">{statusMessage}</p>
					<p>
						{#if data.emailConfirmed}
							Organization creation is paused for this account. Return to the dashboard or contact support if this looks
							wrong.
						{:else}
							Signup only creates the User Account. Email confirmation must finish before Organization setup starts.
						{/if}
					</p>
				</div>
			{/if}

			<div class="grid gap-2">
				<label class="field-label" for="name">Organization Name</label>
				<Input
					id="name"
					name="name"
					type="text"
					placeholder="e.g., 1st Battalion"
					required
					disabled={!data.emailConfirmed || !data.canCreate}
				/>
			</div>

			<div class="seed-info">
				<p class="seed-label">Included On Day One</p>
				<p>
					Your organization starts with default groups, status types, assignment types, and federal holidays so you are
					not staring at a blank page after setup.
				</p>
				<p>After creation, you will land on the owner dashboard with the first-run setup checklist.</p>
			</div>

			<div class="actions">
				<Button href="/" variant="outline">Cancel</Button>
				<Button type="submit" disabled={!canSubmit}>
					{loading ? 'Creating...' : 'Create Organization'}
				</Button>
			</div>
		</form>
	</div>
</div>

<style>
	.create-page {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: var(--background);
		padding: 1.5rem;
	}

	.create-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow:
			0 4px 20px rgb(0 0 0 / 0.12),
			0 2px 6px rgb(0 0 0 / 0.07);
		padding: 1.5rem;
		width: 100%;
		max-width: 520px;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.card-intro {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border);
	}

	.eyebrow,
	.seed-label,
	.field-label {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.field-label {
		color: var(--muted-foreground);
	}

	.create-card h1 {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2.4rem, 5vw, 3.4rem);
		line-height: 0.94;
		font-weight: 800;
		text-transform: uppercase;
		margin: 0;
		color: var(--foreground);
	}

	.subtitle {
		margin: 0;
		color: var(--muted-foreground);
		font-size: 1rem;
		line-height: 1.55;
	}

	.error-message {
		background: color-mix(in srgb, var(--destructive) 12%, var(--card));
		border: 1px solid var(--border);
		color: var(--destructive);
		padding: 0.75rem 1rem;
		border-radius: var(--radius);
		font-size: 0.8125rem;
		margin-bottom: 1rem;
	}

	.status-message {
		background: color-mix(in srgb, var(--accent) 10%, var(--card));
		border: 1px solid var(--border);
		color: var(--muted-foreground);
		padding: 0.9rem 1rem;
		border-radius: var(--radius);
		font-size: 0.8125rem;
		margin-bottom: 1rem;
	}

	.status-message p {
		margin: 0;
		line-height: 1.55;
	}

	.status-message p + p {
		margin-top: 0.45rem;
	}

	.seed-info {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--muted-foreground);
		background: color-mix(in srgb, var(--muted) 72%, var(--card) 28%);
		padding: 1rem;
		border-radius: var(--radius);
		margin: 1rem 0 0;
		border: 1px solid var(--border);
	}

	.seed-info p {
		margin: 0;
		line-height: 1.55;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--border);
	}

	@media (max-width: 640px) {
		.create-page {
			padding: 1rem;
		}

		.create-card {
			padding: 1.25rem;
		}

		.actions {
			flex-direction: column-reverse;
		}

		.actions :global([data-slot='button']) {
			width: 100%;
		}
	}
</style>
