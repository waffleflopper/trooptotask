/**
 * One row's action, from idle to saved. A save that clears the row removes it through the
 * page's overlay or store, so success returns to idle rather than to a done state the row
 * would have to hide; a partial save leaves a smaller row that can act again.
 */
export type NeedsYouActionState<Panel> =
	| { status: 'idle' }
	| { status: 'opening' }
	| { status: 'open'; panel: Panel }
	| { status: 'saving'; panel: Panel | null }
	| { status: 'failed'; panel: Panel | null; message: string };

export type NeedsYouActionEvent<Panel> =
	| { type: 'open' }
	| { type: 'opened'; panel: Panel }
	| { type: 'close' }
	| { type: 'save' }
	| { type: 'saved' }
	| { type: 'failed'; message: string };

export const IDLE_ACTION = { status: 'idle' } as const;

function panelOf<Panel>(state: NeedsYouActionState<Panel>): Panel | null {
	return 'panel' in state ? state.panel : null;
}

export function nextActionState<Panel>(
	state: NeedsYouActionState<Panel>,
	event: NeedsYouActionEvent<Panel>
): NeedsYouActionState<Panel> {
	switch (event.type) {
		case 'open':
			return state.status === 'idle' || (state.status === 'failed' && !state.panel) ? { status: 'opening' } : state;
		case 'opened':
			return state.status === 'opening' ? { status: 'open', panel: event.panel } : state;
		case 'close':
			if (state.status === 'opening' || state.status === 'open') return IDLE_ACTION;
			if (state.status === 'failed') return { ...state, panel: null };
			return state;
		case 'save':
			return state.status === 'saving' || state.status === 'opening'
				? state
				: { status: 'saving', panel: panelOf(state) };
		case 'saved':
			return state.status === 'saving' ? IDLE_ACTION : state;
		case 'failed':
			return state.status === 'saving' || state.status === 'opening'
				? { status: 'failed', panel: panelOf(state), message: event.message }
				: state;
	}
}
