import { getRequestId, handlePathBError, json, setCors, withCorsPreflight } from './_lib/pathb/http';

// Import all handlers
import approvalsHandler from './_lib/pathb/approvals';
import auditEventsHandler from './_lib/pathb/audit-events';
import bootstrapHandler from './_lib/pathb/bootstrap';
import brokeragesHandler from './_lib/pathb/brokerages';
import deliveriesHandler from './_lib/pathb/deliveries';
import jobDetailHandler from './_lib/pathb/job-detail';
import jobTransitionHandler from './_lib/pathb/job-transition';
import jobsHandler from './_lib/pathb/jobs';
import membershipsHandler from './_lib/pathb/memberships';
import officesHandler from './_lib/pathb/offices';
import presetsHandler from './_lib/pathb/presets';
import reportExportHandler from './_lib/pathb/report-export';
import reportsHandler from './_lib/pathb/reports';
import reviewQueueHandler from './_lib/pathb/review-queue';
import revisionsHandler from './_lib/pathb/revisions';
import teamsHandler from './_lib/pathb/teams';
import usersHandler from './_lib/pathb/users';

export default async function handler(req: any, res: any) {
    // Extract action from query or URL
    const { action } = req.query;
    const requestId = getRequestId(req);

    if (!action) {
        return json(res, 400, {
            ok: false,
            error: { code: 'VALIDATION_FAILED', message: 'Missing action parameter' },
            requestId,
        });
    }

    // Route to the appropriate handler
    switch (action) {
        case 'approvals': return approvalsHandler(req, res);
        case 'audit-events': return auditEventsHandler(req, res);
        case 'bootstrap': return bootstrapHandler(req, res);
        case 'brokerages': return brokeragesHandler(req, res);
        case 'deliveries': return deliveriesHandler(req, res);
        case 'job-detail': return jobDetailHandler(req, res);
        case 'job-transition': return jobTransitionHandler(req, res);
        case 'jobs': return jobsHandler(req, res);
        case 'memberships': return membershipsHandler(req, res);
        case 'offices': return officesHandler(req, res);
        case 'presets': return presetsHandler(req, res);
        case 'report-export': return reportExportHandler(req, res);
        case 'reports': return reportsHandler(req, res);
        case 'review-queue': return reviewQueueHandler(req, res);
        case 'revisions': return revisionsHandler(req, res);
        case 'teams': return teamsHandler(req, res);
        case 'users': return usersHandler(req, res);
        default:
            return json(res, 404, {
                ok: false,
                error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` },
                requestId,
            });
    }
}
