import type { RequestPersonnelArchiveApproval } from '$features/personnel';
import { submitDeletionRequest } from '$features/deletion-requests';

/** Bind Personnel's archive intent to the owned approval transport. */
export const requestPersonnelArchiveApproval: RequestPersonnelArchiveApproval = (request) =>
	submitDeletionRequest(request.orgId, 'personnel', request.personnelId, request.description, request.resourceUrl);
