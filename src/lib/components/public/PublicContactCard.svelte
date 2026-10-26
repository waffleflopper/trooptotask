<script lang="ts">
	import { monoLabel } from './layout';

	interface Props {
		email: string;
		subject?: string;
	}

	let { email, subject }: Props = $props();
</script>

<a
	href={`mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`}
	class="inline-flex h-12 items-center self-start rounded-lg border border-border px-6 {monoLabel} text-foreground no-underline transition-colors duration-[120ms] hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
	>{email}</a
>
