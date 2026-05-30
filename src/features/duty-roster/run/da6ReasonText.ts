export type Da6ReasonCode =
	| 'advanced-duty-cooldown'
	| 'advanced-duty-overlap'
	| 'authorized-absence'
	| 'misconduct-unavailable'
	| 'no-eligible-personnel'
	| 'other-duty-status';

export interface Da6ReasonParams {
	statusNames?: string[];
}

function formatStatusNames(params: Da6ReasonParams | undefined): string {
	return params?.statusNames?.join(', ') || 'status';
}

export function da6ReasonText(reasonCode: Da6ReasonCode | null | undefined, params?: Da6ReasonParams): string | null {
	if (!reasonCode) {
		return null;
	}

	switch (reasonCode) {
		case 'advanced-duty-cooldown':
			return 'In cooldown from blocking advanced duty coverage';
		case 'advanced-duty-overlap':
			return 'Assigned to blocking advanced duty coverage';
		case 'authorized-absence':
			return `Authorized absence: ${formatStatusNames(params)}`;
		case 'misconduct-unavailable':
			return params?.statusNames
				? `Misconduct unavailable: ${formatStatusNames(params)}`
				: 'Unavailable due to misconduct/AWOL-style status';
		case 'no-eligible-personnel':
			return 'No eligible personnel available';
		case 'other-duty-status':
			return `Other duty: ${formatStatusNames(params)}`;
	}

	const exhaustive: never = reasonCode;
	return exhaustive;
}
