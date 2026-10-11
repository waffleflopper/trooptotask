<script lang="ts">
	interface Props {
		email: string;
		subject?: string;
	}

	let { email, subject }: Props = $props();
</script>

<div class="inline-flex items-center gap-3 rounded-md border border-accent/28 bg-accent/14 px-5 py-3.5">
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
		class="flex-none text-accent-text"
	>
		<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
		<polyline points="22,6 12,13 2,6" />
	</svg>
	<a
		href={`mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`}
		class="font-mono text-[0.8125rem] font-medium tracking-[0.06em] text-accent-text uppercase no-underline hover:underline"
		>{email}</a
	>
</div>
