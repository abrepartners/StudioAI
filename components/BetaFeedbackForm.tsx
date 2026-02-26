import React, { useMemo, useState } from 'react';
import { Send, ClipboardCopy, CheckCircle2, AlertTriangle, ThumbsUp, ThumbsDown } from 'lucide-react';
import { FurnitureRoomType } from '../types';

interface BetaFeedbackFormProps {
  selectedRoom: FurnitureRoomType;
  hasGenerated: boolean;
  stagedFurnitureCount: number;
  stageMode?: 'text' | 'packs' | 'furniture';
  betaUserId?: string;
  referralCode?: string;
  acceptedInvites?: number;
  insiderUnlocked?: boolean;
  pro2kUnlocked?: boolean;
  generatedImage?: string | null;
  mode?: 'full' | 'quick-only';
  quickRequired?: boolean;
  onQuickSubmitted?: () => void;
}

type FeedbackCategory = 'Navigation' | 'Design Quality' | 'Prompting' | 'Bug' | 'Other';

const STORAGE_KEY = 'studioai_beta_feedback_queue';

const BetaFeedbackForm: React.FC<BetaFeedbackFormProps> = ({
  selectedRoom,
  hasGenerated,
  stagedFurnitureCount,
  stageMode = 'text',
  betaUserId = '',
  referralCode = '',
  acceptedInvites = 0,
  insiderUnlocked = false,
  pro2kUnlocked = false,
  generatedImage = null,
  mode = 'full',
  quickRequired = false,
  onQuickSubmitted,
}) => {
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null);
  const [quickReason, setQuickReason] = useState('');
  const [isQuickSubmitting, setIsQuickSubmitting] = useState(false);
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

  const buildContextMetadata = () => ({
    selectedRoom,
    hasGenerated,
    stagedFurnitureCount,
    stageMode,
    betaUserId,
    referralCode,
    acceptedInvites,
    insiderUnlocked,
    pro2kUnlocked,
    appPanel: 'Design Studio',
    appUrl: window.location.href,
    userAgent: navigator.userAgent,
  });

  const buildPayload = (overrides?: {
    category?: FeedbackCategory;
    title?: string;
    details?: string;
    metadata?: Record<string, unknown>;
  }) => ({
    source: 'StudioAI Beta',
    category: overrides?.category || category,
    title: overrides?.title || title.trim(),
    details: overrides?.details || details.trim(),
    contact: contact.trim() || null,
    createdAt: new Date().toISOString(),
    metadata: {
      ...buildContextMetadata(),
      ...(overrides?.metadata || {}),
    },
  });

  const getCompressedScreenshot = async (): Promise<string | null> => {
    if (!generatedImage) return null;
    if (!generatedImage.startsWith('data:image/')) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 768;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          const budget = 120000;
          const candidates = [0.72, 0.58, 0.45];
          for (const quality of candidates) {
            const shot = canvas.toDataURL('image/jpeg', quality);
            if (shot.length <= budget) {
              resolve(shot);
              return;
            }
          }
          resolve(null);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = generatedImage;
    });
  };

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

  const submitPayload = async (payload: ReturnType<typeof buildPayload>, isQuick = false) => {
    const payloadText = JSON.stringify(payload, null, 2);
    setLastPayload(payloadText);
    setStatus('idle');
    setStatusMessage('');

    if (isQuick) setIsQuickSubmitting(true);
    else setIsSubmitting(true);

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
    } catch {
      queuePayloadLocally(payload);
      setStatus('error');
      setStatusMessage(
        'Submission failed. Feedback was queued locally so it is not lost.'
      );
    } finally {
      if (isQuick) setIsQuickSubmitting(false);
      else setIsSubmitting(false);
    }
  };

  const onQuickSubmit = async () => {
    if (!reaction) return;
    if (reaction === 'down' && !quickReason.trim()) {
      setStatus('error');
      setStatusMessage('Please tell us what was wrong before submitting thumbs down.');
      return;
    }

    const screenshotDataUrl = reaction === 'down' ? await getCompressedScreenshot() : null;
    const payload = buildPayload({
      category: 'Design Quality',
      title: reaction === 'up' ? 'Render feedback: thumbs up' : 'Render feedback: thumbs down',
      details:
        reaction === 'up'
          ? 'User gave this render a thumbs up.'
          : quickReason.trim(),
      metadata: {
        feedbackMode: 'quick-reaction',
        reaction,
        screenshotIncluded: Boolean(screenshotDataUrl),
        screenshotDataUrl,
      },
    });

    await submitPayload(payload, true);
    if (reaction === 'down') setQuickReason('');
    setReaction(null);
    onQuickSubmitted?.();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !details.trim()) {
      setStatus('error');
      setStatusMessage('Please provide a short title and details.');
      return;
    }

    const payload = buildPayload();
    await submitPayload(payload, false);
    setTitle('');
    setDetails('');
    setContact('');
  };

  const quickFeedbackBlock = (
    <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-white/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text)]/72">Quick Rating</p>
      <p className="mt-1 text-xs text-[var(--color-text)]/75">
        {quickRequired
          ? 'Please rate this result to continue.'
          : 'Give this result a quick thumbs up/down.'}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setReaction('up')}
          className={`rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2 ${reaction === 'up'
              ? 'border border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border border-[var(--color-border)] bg-white text-[var(--color-ink)]'
            }`}
        >
          <ThumbsUp size={14} /> Thumbs Up
        </button>
        <button
          type="button"
          onClick={() => setReaction('down')}
          className={`rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2 ${reaction === 'down'
              ? 'border border-rose-300 bg-rose-50 text-rose-900'
              : 'border border-[var(--color-border)] bg-white text-[var(--color-ink)]'
            }`}
        >
          <ThumbsDown size={14} /> Thumbs Down
        </button>
      </div>

      {reaction === 'down' && (
        <div className="mt-3 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text)]/72">
            What was wrong?
          </label>
          <textarea
            value={quickReason}
            onChange={(e) => setQuickReason(e.target.value)}
            rows={3}
            placeholder="Tell us what looked wrong so we can improve this output."
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)]"
          />
          {generatedImage && (
            <div className="rounded-xl border border-[var(--color-border)] bg-white p-2">
              <img
                src={generatedImage}
                alt="Current generated result preview"
                className="max-h-36 w-full rounded-lg object-cover"
              />
              <p className="mt-1 text-[11px] text-[var(--color-text)]/70">
                A compressed screenshot preview will be attached to this report.
              </p>
            </div>
          )}
        </div>
      )}

      {reaction && (
        <button
          type="button"
          onClick={onQuickSubmit}
          disabled={isQuickSubmitting || (reaction === 'down' && !quickReason.trim())}
          className="cta-primary mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {isQuickSubmitting ? 'Submitting...' : quickRequired ? 'Submit and Continue' : 'Submit Quick Feedback'}
        </button>
      )}
    </div>
  );

  if (mode === 'quick-only') {
    return (
      <div className="premium-surface rounded-3xl p-5">
        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text)]/70">Feedback Checkpoint</p>
          <h3 className="font-display text-xl mt-1">Rate This Result</h3>
        </div>
        {quickFeedbackBlock}
        {status !== 'idle' && (
          <div
            className={`mt-3 rounded-xl px-3 py-2 text-xs ${status === 'submitted'
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
      </div>
    );
  }

  return (
    <div className="premium-surface rounded-3xl p-5">
      <div className="mb-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text)]/70">Beta Feedback</p>
        <h3 className="font-display text-xl mt-1">Tell us what feels off</h3>
        <p className="text-sm text-[var(--color-text)]/78 mt-1">
          This helps prioritize the next iteration. Use this for confusing flows, missing controls, or visual issues.
        </p>
      </div>
      {quickFeedbackBlock}

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
        </div>
      </form>

      {status !== 'idle' && (
        <div
          className={`mt-3 rounded-xl px-3 py-2 text-xs ${status === 'submitted'
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
    </div>
  );
};

export default BetaFeedbackForm;
