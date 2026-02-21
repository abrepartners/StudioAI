const LINEAR_API_URL = 'https://api.linear.app/graphql';

type FeedbackPayload = {
  source?: string;
  category?: string;
  title?: string;
  details?: string;
  contact?: string | null;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

const buildIssueDescription = (payload: FeedbackPayload) => {
  const metadata = payload.metadata || {};
  return [
    '## Beta Feedback Intake',
    '',
    `- **Source:** ${payload.source || 'StudioAI Beta'}`,
    `- **Category:** ${payload.category || 'Other'}`,
    `- **Created At:** ${payload.createdAt || new Date().toISOString()}`,
    `- **Contact:** ${payload.contact || 'Not provided'}`,
    '',
    '### Feedback Details',
    '',
    payload.details || '(No details provided)',
    '',
    '### Context',
    '',
    '```json',
    JSON.stringify(metadata, null, 2),
    '```',
  ].join('\n');
};

const parseBody = (rawBody: unknown): FeedbackPayload => {
  if (!rawBody) return {};
  if (typeof rawBody === 'string') {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }
  if (typeof rawBody === 'object') return rawBody as FeedbackPayload;
  return {};
};

const json = (res: any, status: number, body: Record<string, unknown>) => {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  const linearApiKey = process.env.LINEAR_API_KEY;
  const linearTeamId = process.env.LINEAR_TEAM_ID;

  if (!linearApiKey || !linearTeamId) {
    json(res, 503, {
      ok: false,
      error: 'Feedback intake is not configured',
      missing: {
        LINEAR_API_KEY: !linearApiKey,
        LINEAR_TEAM_ID: !linearTeamId,
      },
    });
    return;
  }

  const payload = parseBody(req.body);
  const title = String(payload.title || '').trim();
  const details = String(payload.details || '').trim();
  const category = String(payload.category || 'Other').trim();

  if (!title || !details) {
    json(res, 400, { ok: false, error: 'title and details are required' });
    return;
  }

  const issueTitle = `[Beta][${category}] ${title}`;
  const issueDescription = buildIssueDescription({ ...payload, category, title, details });

  const mutation = `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
  `;

  const variables = {
    input: {
      teamId: linearTeamId,
      title: issueTitle,
      description: issueDescription,
    },
  };

  try {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: linearApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const result = await response.json();

    if (!response.ok || result.errors?.length) {
      json(res, 502, {
        ok: false,
        error: 'Linear issue creation failed',
        details: result.errors || result,
      });
      return;
    }

    const issue = result.data?.issueCreate?.issue;
    json(res, 200, {
      ok: true,
      issue: {
        id: issue?.id || null,
        identifier: issue?.identifier || null,
        url: issue?.url || null,
      },
    });
  } catch (error: any) {
    json(res, 500, {
      ok: false,
      error: 'Unexpected feedback intake error',
      details: error?.message || String(error),
    });
  }
}
