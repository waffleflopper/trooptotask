import { buildRequestError, rejectedRequestMessage } from '$lib/stores/core';
import { refreshPersonnelDetailCounts } from './detailCounts';

export interface ArtifactDraftContext {
	orgId: string;
	personId: string;
}

export interface ArtifactDraftRequest {
	body: BodyInit;
	headers?: HeadersInit;
}

export interface ArtifactDraftIssue<TInput extends object> {
	field: keyof TInput;
	message: string;
}

export interface ArtifactDraftSpec<TInput extends object, TResult extends { id: string }> {
	createEmptyInput: () => TInput;
	endpoint: (context: ArtifactDraftContext) => string;
	validate: (input: TInput) => ArtifactDraftIssue<TInput> | null;
	encode: (input: TInput) => ArtifactDraftRequest;
	decode?: (response: Response) => Promise<TResult>;
	errorFallback: string;
	reset?: (input: TInput) => TInput;
	selectFile?: (input: TInput, file: File | null) => void;
}

export interface ArtifactDraftDeps {
	context: ArtifactDraftContext | (() => ArtifactDraftContext);
	fetch: typeof fetch;
}

function resolveContext(context: ArtifactDraftDeps['context']): ArtifactDraftContext {
	return typeof context === 'function' ? context() : context;
}

function upsertById<TResult extends { id: string }>(item: TResult, items: TResult[]): TResult[] {
	return [item, ...items.filter((existing) => existing.id !== item.id)];
}

export class ArtifactDraft<TInput extends object, TResult extends { id: string }> {
	readonly #spec: ArtifactDraftSpec<TInput, TResult>;
	readonly #deps: ArtifactDraftDeps;

	fields: TInput;
	saving = $state(false);
	error = $state('');
	issue = $state<ArtifactDraftIssue<TInput> | null>(null);
	items = $state<TResult[]>([]);

	constructor(spec: ArtifactDraftSpec<TInput, TResult>, deps: ArtifactDraftDeps) {
		this.#spec = spec;
		this.#deps = deps;
		this.fields = $state(spec.createEmptyInput());
	}

	/** The validation message for one field, or an empty string. */
	fieldError(field: keyof TInput): string {
		return this.issue?.field === field ? this.issue.message : '';
	}

	/** Resolves true when the draft was saved and its fields were reset. */
	submit = async (): Promise<boolean> => {
		this.error = '';
		this.issue = this.#spec.validate(this.fields);
		if (this.issue) return false;

		this.saving = true;
		try {
			const request = this.#spec.encode(this.fields);
			const context = resolveContext(this.#deps.context);
			const response = await this.#deps.fetch(this.#spec.endpoint(context), {
				method: 'POST',
				headers: request.headers,
				body: request.body
			});
			if (!response.ok) throw await buildRequestError(response, 'POST', this.#spec.endpoint(context));
			this.upsert(this.#spec.decode ? await this.#spec.decode(response) : ((await response.json()) as TResult));
			this.fields = this.#spec.reset?.(this.fields) ?? this.#spec.createEmptyInput();
			void refreshPersonnelDetailCounts();
			return true;
		} catch (caught) {
			this.error = rejectedRequestMessage(caught, this.#spec.errorFallback);
			return false;
		} finally {
			this.saving = false;
		}
	};

	upsert = (item: TResult): void => {
		this.items = upsertById(item, this.items);
	};

	mergeLoaded(loaded: TResult[]): TResult[] {
		// These are transient lookup tables for one synchronous merge, not reactive state.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const updatedById = new Map(this.items.map((item) => [item.id, item]));
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const loadedIds = new Set(loaded.map((item) => item.id));
		const created = this.items.filter((item) => !loadedIds.has(item.id));
		return [...created, ...loaded.map((item) => updatedById.get(item.id) ?? item)];
	}

	selectFile = (file: File | null): void => {
		this.#spec.selectFile?.(this.fields, file);
	};
}
