<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	// Server-side guard ensures only suspended users see this
</script>

<div class="suspended-container">
	<div class="suspended-card">
		<p class="eyebrow">Access Restricted</p>
		<h1>Account Suspended</h1>
		<p class="message">
			This account is currently suspended. If you believe that is incorrect, contact support so we can review it.
		</p>
		<div class="contact-panel">
			<p class="contact-label">Support</p>
			<p class="contact">support@trooptotask.org</p>
		</div>
		<Button href="/auth/login" variant="outline">Back to Login</Button>
	</div>
</div>

<style>
	.suspended-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: var(--background);
		padding: 1.5rem;
	}

	.suspended-card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 480px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.5rem;
		box-shadow:
			0 4px 20px rgb(0 0 0 / 0.12),
			0 2px 6px rgb(0 0 0 / 0.07);
	}

	.eyebrow,
	.contact-label {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--accent);
		margin: 0;
	}

	h1 {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2.3rem, 5vw, 3.2rem);
		line-height: 0.94;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--destructive);
		margin: 0;
	}

	.message {
		color: var(--muted-foreground);
		margin: 0;
		line-height: 1.6;
	}

	.contact-panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--muted) 72%, var(--card) 28%);
	}

	.contact {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--foreground);
	}

	@media (max-width: 640px) {
		.suspended-container {
			padding: 1rem;
		}

		.suspended-card {
			padding: 1.25rem;
		}
	}
</style>
