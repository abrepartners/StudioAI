// Import all beta handlers from the internal lib
import activateHandler from './_lib/beta/beta-activate';
import adminCodesHandler from './_lib/beta/beta-admin-codes';
import adminLoginHandler from './_lib/beta/beta-admin-login';
import meHandler from './_lib/beta/beta-me';
import shareHandler from './_lib/beta/beta-share';

export default async function handler(req: any, res: any) {
    // Extract action from query or URL
    const { action } = req.query;

    if (!action) {
        res.status(400).setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify({ ok: false, error: 'Missing beta action parameter' }));
        return;
    }

    // Route to the appropriate handler
    switch (action) {
        case 'activate': return activateHandler(req, res);
        case 'admin-codes': return adminCodesHandler(req, res);
        case 'admin-login': return adminLoginHandler(req, res);
        case 'me': return meHandler(req, res);
        case 'share': return shareHandler(req, res);
        default:
            res.status(404).setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify({ ok: false, error: `Unknown beta action: ${action}` }));
            return;
    }
}
