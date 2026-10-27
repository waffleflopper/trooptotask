import { getContext, setContext } from 'svelte';

/** What a Calendar marker points at. `personnelId` names the row a commitment was opened from. */
export type ProjectionTarget =
	| { readonly kind: 'event'; readonly id: string }
	| { readonly kind: 'tasking'; readonly id: string; readonly personnelId?: string };

export interface ProjectionCardChoice {
	readonly key: string;
	readonly title: string;
	readonly detail: string;
	readonly href: string;
	readonly target: ProjectionTarget;
}

/** One card, or a short list to choose a card from when a marker stands for several. */
export type ProjectionCardRequest =
	| { readonly kind: 'one'; readonly target: ProjectionTarget }
	| { readonly kind: 'list'; readonly heading: string; readonly choices: readonly ProjectionCardChoice[] };

export interface ProjectionCards {
	open(request: ProjectionCardRequest, anchor: HTMLElement): void;
}

const KEY = Symbol('projection-cards');

export function setProjectionCards(cards: ProjectionCards): void {
	setContext(KEY, cards);
}

/** Absent outside the Calendar page, where a marker stays a plain link. */
export function getProjectionCards(): ProjectionCards | undefined {
	return getContext<ProjectionCards | undefined>(KEY);
}
