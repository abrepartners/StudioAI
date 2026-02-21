import React, { useMemo, useState } from 'react';
import { Send, ClipboardCopy, CheckCircle2, AlertTriangle } from 'lucide-react';
import { FurnitureRoomType } from '../types';

interface BetaFeedbackFormProps {
  selectedRoom: FurnitureRoomType;
  hasGenerated: boolean;
  stagedFurnitureCount: number;
  stageMode?: 'text' | 'packs' | 'furniture';
}

type FeedbackCategory = 'Navigation' | 'Design Quality' | 'Prompting' | 'Bug' | 'Other';

const STORAGE_KEY = 'studioai_beta_feedback_queue';

const BetaFeedbackForm: React.FC<BetaFeedbackFormProps> = ({
  selectedRoom,
  hasGenerated,
  stagedFurnitureCount,
  stageMode = 'text',
}) => {
  const [category, setCategory] = useState<FeedbackCategory>('Design Quality');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [contact, setContact] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitted' | 'queued' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [lastPayload, setLastPayload] = useState<string>('');

  const webhookUrl = useMemo(() => {
    const raw = (import.meta as any)?.env?.VITE_LINEAR_FEEDBACK_WEBHOOK;
    const configured = typeof raw === 'string' ? raw.trim() : '';
    return configured || '/api/feedback';
  }, []);

  const buildPayload = () => ({
    source: 'StudioAI Beta',
    category,
    title: title.trim(),
    details: details.trim(),
    contact: contact.trim() || null,
    createdAt: new Date().toISOString(),
    metadata: {
      selectedRoom,
      hasGenerated,
      stagedFurnitureCount,
      stageMode,
      appPanel: 'Design Studio',
      appUrl: window.location.href,
      userAgent: navigator.userAgent,
    },
  });

  const queuePayloadLocally = (payload: unknown) => {
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const queue = Array.isArray(existing) ? existing : [];
      queue.push(payload);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
      // If localStorage fails, we still expose payload for manual copy.
    }
  };

  const copyPayload = async () => {
    if (!lastPayload) return;
    try {
      await navigator.clipboard.writeText(lastPayload);
      setStatusMessage('Feedback payload copied. You can paste it into Linear manually.');
    } catch {
      setStatusMessage('Could not copy automatically. Select and copy from browser devtools if needed.');
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !details.trim()) {
      setStatus('error');
      setStatusMessage('Please provide a short title and details.');
      return;
    }

    const payload = buildPayload();
    const payloadText = JSON.stringify(payload, null, 2);
    setLastPayload(payloadText);
    setIsSubmitting(true);
    setStatus('idle');
    setStatusMessage('');

    try {
      if (webhookUrl) {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Webhook returned ${response.status}`);
        }

        const intakeResult = await response.json().catch(() => null);
        const issueKey = intakeResult?.issue?.identifier;

        setStatus('submitted');
        setStatusMessage(
          issueKey
            ? `Feedback submitted to Linear (${issueKey}).`
            : 'Feedback submitted to Linear intake.'
        );
      } else {
        queuePayloadLocally(payload);
        setStatus('queued');
        setStatusMessage(
          'No webhook configured. Feedback was queued locally and can be copied into Linear.'
        );
      }

      setTitle('');
      setDetails('');
      setContact('');
    } catch {
      queuePayloadLocally(payload);
      setStatus('error');
      setStatusMessage(
        'Submission failed. Feedback was queued locally so it is not lost.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="premium-surface rounded-3xl p-5">
      <div className="mb-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text)]/70">Beta Feedback</p>
        <h3 className="font-display text-xl mt-1">Tell us what feels off</h3>
        <p className="text-sm text-[var(--color-text)]/78 mt-1">
          This helps prioritize the next iteration. Use this for confusing flows, missing controls, or visual issues.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text)]/72">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
          >
            <option>Navigation</option>
            <option>Design Quality</option>
            <option>Prompting</option>
            <option>Bug</option>
            <option>Other</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text)]/72">
            Short title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Example: Tool placement is hard to scan on mobile"
            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text)]/72">
            Details
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            placeholder="What happened, what you expected, and where it occurred."
            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text)]/72">
            Contact (optional)
          </label>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Email, @handle, or name"
            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="cta-primary rounded-xl px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Send size={14} />
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
          <button
            type="button"
            onClick={copyPayload}
            disabled={!lastPayload}
            className="cta-secondary rounded-xl px-3 py-2.5 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            <ClipboardCopy size={14} />
            Copy Payload
          </button>
        </div>
      </form>

      {status !== 'idle' && (
        <div
          className={`mt-3 rounded-xl px-3 py-2 text-xs ${
            status === 'submitted'
              ? 'border border-emerald-300/60 bg-emerald-50 text-emerald-900'
              : status === 'queued'
                ? 'border border-amber-300/60 bg-amber-50 text-amber-900'
                : 'border border-rose-300/60 bg-rose-50 text-rose-900'
          }`}
        >
          <p className="inline-flex items-center gap-1.5">
            {status === 'submitted' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {statusMessage}
          </p>
        </div>
      )}

      <p className="mt-3 text-[11px] text-[var(--color-text)]/65">
        Intake endpoint: <code>{webhookUrl}</code>. Set <code>VITE_LINEAR_FEEDBACK_WEBHOOK</code> to override.
      </p>
    </div>
  );
};

export default BetaFeedbackForm;
