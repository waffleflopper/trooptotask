import type { Snippet } from 'svelte';

export type PacketStepTone = 'checkbox' | 'training' | 'paperwork' | 'inactive' | 'neutral';
export type PacketStepState = 'complete' | 'incomplete' | 'inactive' | 'pending';

export interface ChildrenProps {
	children?: Snippet;
}
