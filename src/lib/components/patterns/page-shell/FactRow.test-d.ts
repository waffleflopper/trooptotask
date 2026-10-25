import { createRawSnippet, type ComponentProps } from 'svelte';
import { FactRow } from './index.js';

const lane = createRawSnippet(() => ({ render: () => '<i></i>' }));

export const rejectedFactRowProps: ComponentProps<typeof FactRow>[] = [
	// @ts-expect-error lanes replace the value lane
	{ variant: 'display', label: 'A', value: 'x', control: lane },
	// @ts-expect-error lanes replace the children
	{ variant: 'display', label: 'A', children: lane, details: lane },
	// @ts-expect-error lanes belong to the display variant
	{ label: 'A', control: lane },
	// @ts-expect-error lanes belong to the display variant
	{ variant: 'compact', label: 'A', control: lane }
];
