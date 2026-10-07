export interface RequestFailureDetails {
	reason?: string;
	requiresStepUp?: boolean;
	stepUpPath?: string | null;
}

/**
 * A failure the app raised on purpose. Server boundaries forward the status and
 * message of a 4xx RequestFailure; every other thrown value becomes a generic 500.
 */
export class RequestFailure extends Error implements RequestFailureDetails {
	override readonly name = 'RequestFailure';
	readonly reason?: string;
	readonly requiresStepUp?: boolean;
	readonly stepUpPath?: string | null;

	constructor(
		readonly status: number,
		message: string,
		details: RequestFailureDetails = {}
	) {
		super(message);
		this.reason = details.reason;
		this.requiresStepUp = details.requiresStepUp;
		this.stepUpPath = details.stepUpPath;
	}
}

export function fail(status: number, message: string, details?: RequestFailureDetails): never {
	throw new RequestFailure(status, message, details);
}
