<script lang="ts">
	interface Props {
		email: string;
		subject?: string;
	}

	let { email, subject }: Props = $props();
</script>

<div class="contact-card">
	<svg
		aria-hidden="true"
		viewBox="0 0 24 24"
		width="20"
		height="20"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
		<polyline points="22,6 12,13 2,6" />
	</svg>
	<a href={`mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`}>{email}</a>
</div>

<style>
	.contact-card {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		background: var(--brass-muted);
		border: 1px solid color-mix(in srgb, var(--brass) 28%, transparent);
		border-radius: var(--radius);
	}

	svg {
		flex: 0 0 auto;
		color: var(--brass-text);
	}

	.contact-card a:any-link {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.8125rem;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-decoration: none;
		text-transform: uppercase;
	}

	.contact-card a:any-link:hover {
		color: var(--brass-text);
		text-decoration: underline;
	}
</style>
