<script lang="ts">
	import { cn } from '$lib/utils';

	let { class: className }: { class?: string } = $props();
</script>

<svg
	class={cn('h-10! w-12! shrink-0 text-sidebar-primary', className)}
	viewBox="0 0 512 512"
	fill="none"
	role="img"
	aria-label="Troop to Task"
	xmlns="http://www.w3.org/2000/svg"
>
	<g fill="none" fill-rule="evenodd" stroke-linejoin="round" stroke-linecap="round">
		<rect x="75" y="99" width="362" height="294" rx="17" class="stroke-foreground" stroke-width="12" />
		<rect x="87" y="111" width="338" height="270" rx="10" class="stroke-foreground" stroke-width="4" />
	</g>
	<path
		d="M94.07 138.07H200.22V160.54H162.03V253.27H132.33V160.54H94.07V138.07ZM246.6 231.44H297.28V253.27H213.57V231.44L255.61 194.31Q261.26 189.23 263.96 184.36Q266.65 179.5 266.65 174.27Q266.65 166.17 261.22 161.23Q255.78 156.29 246.75 156.29Q239.81 156.29 231.54 159.26Q223.3 162.22 213.89 168.09V142.79Q223.91 139.48 233.71 137.75Q243.51 136 252.92 136Q273.61 136 285.06 145.11Q296.52 154.19 296.52 170.49Q296.52 179.89 291.65 188.04Q286.79 196.16 271.21 209.84L246.6 231.44ZM311.78 138.07H417.93V160.54H379.74V253.27H350.04V160.54H311.78V138.07Z"
		fill="currentColor"
		fill-rule="nonzero"
	/>
	<g fill="currentColor">
		<polygon points="102,314 132,314 116,356 86,356" />
		<polygon points="142,314 172,314 156,356 126,356" />
		<polygon points="182,314 212,314 196,356 166,356" />
	</g>
	<polygon
		points="213,314 335,314 335,296 405,335 335,374 335,356 196,356"
		class="fill-foreground stroke-foreground"
		stroke-width="4"
		stroke-linejoin="round"
	/>
	<polygon points="392,314 429,335 392,356 409,335" fill="currentColor" />
</svg>
