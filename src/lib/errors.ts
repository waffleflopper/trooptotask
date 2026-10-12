export interface RequestFailureDetails {
	reason?: string;
	requiresStepUp?: boolean;
	stepUpPath?: string | null;
	/** The message was written for the user, so a 5xx forwards it instead of the generic one. */
	publicMessage?: boolean;
}

/**
 * A failure the app raised on purpose. Server boundaries forward the status and
 * message of a 4xx RequestFailure. A 5xx RequestFailure keeps its status with a
 * generic message unless it was raised with `publicMessage`; any other thrown
 * value becomes a generic 500.
 */
export class RequestFailure extends Error implements RequestFailureDetails {
	override readonly name = 'RequestFailure';
	readonly reason?: string;
	readonly requiresStepUp?: boolean;
	readonly stepUpPath?: string | null;
	readonly publicMessage?: boolean;

	constructor(
		readonly status: number,
		message: string,
		details: RequestFailureDetails = {}
	) {
		super(message);
		this.reason = details.reason;
		this.requiresStepUp = details.requiresStepUp;
		this.stepUpPath = details.stepUpPath;
		this.publicMessage = details.publicMessage;
	}
}

export function fail(status: number, message: string, details?: RequestFailureDetails): never {
	throw new RequestFailure(status, message, details);
}
