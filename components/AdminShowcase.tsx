import React, { useState, useEffect } from 'react';
import { Check, X, Clock, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import Tooltip from './Tooltip';

interface ShowcaseItem {
  id: string;
  user_email: string;
  user_name: string | null;
  tool_used: string;
  before_image: string;
  after_image: string;
  room_type: string | null;
  status: string;
  created_at: string;
}

interface AdminShowcaseProps {
  adminEmail: string;
}

const AdminShowcase: React.FC<AdminShowcaseProps> = ({ adminEmail }) => {
  const [pending, setPending] = useState<ShowcaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pending', adminEmail }),
      }).then(r => r.json());

      if (res.ok) {
        setPending(res.showcases || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded) fetchPending();
  }, [expanded]);

  const handleReview = async (showcaseId: string, status: 'approved' | 'rejected') => {
    setActionInProgress(showcaseId);
    try {
      const res = await fetch('/api/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review',
          adminEmail,
          showcaseId,
          status,
        }),
      }).then(r => r.json());

      if (res.ok) {
        setPending(prev => prev.filter(item => item.id !== showcaseId));
      }
    } catch {
      // silent
    } finally {
      setActionInProgress(null);
    }
  };

  const toolColors: Record<string, string> = {
    staging: '#0A84FF',
    cleanup: '#30D158',
    twilight: '#FF9F0A',
    sky: '#64D2FF',
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <ImageIcon size={16} className="text-[var(--color-primary)]" />
          <h4 className="text-sm font-semibold text-[var(--color-ink)]">Showcase Admin</h4>
          {pending.length > 0 && (
            <span className="rounded-full bg-[#FF375F] text-white text-xs font-bold px-1.5 py-0.5 min-w-[18px] text-center">
              {pending.length}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-5 w-5 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
            </div>
          ) : pending.length === 0 ? (
            <div className="text-center py-6">
              <Clock size={20} className="mx-auto text-zinc-600 mb-2" />
              <p className="text-xs text-zinc-500">No pending submissions</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
                {pending.length} pending review
              </p>
              {pending.map(item => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--color-border)] bg-white/[0.02] overflow-hidden"
                >
                  {/* Before / After thumbnails */}
                  <div className="grid grid-cols-2 gap-px bg-zinc-800">
                    <div className="relative">
                      <img
                        src={item.before_image}
                        alt="Before"
                        className="w-full aspect-[4/3] object-cover"
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-2xs font-bold text-zinc-300 uppercase tracking-wider">
                        Before
                      </span>
                    </div>
                    <div className="relative">
                      <img
                        src={item.after_image.startsWith('data:') ? item.after_image : `data:image/jpeg;base64,${item.after_image}`}
                        alt="After"
                        className="w-full aspect-[4/3] object-cover"
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-2xs font-bold text-zinc-300 uppercase tracking-wider">
                        After
                      </span>
                    </div>
                  </div>

                  {/* Info row */}
                  <div className="px-3 py-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider border"
                          style={{
                            color: toolColors[item.tool_used] || '#0A84FF',
                            borderColor: `${toolColors[item.tool_used] || '#0A84FF'}40`,
                            backgroundColor: `${toolColors[item.tool_used] || '#0A84FF'}15`,
                          }}
                        >
                          {item.tool_used}
                        </span>
                        {item.room_type && (
                          <span className="text-xs text-zinc-500 truncate">{item.room_type}</span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-600 whitespace-nowrap">{formatDate(item.created_at)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-400 truncate">
                        {item.user_name || item.user_email}
                      </p>

                      {/* Approve / Reject buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Tooltip label="Reject">
                          <button
                            type="button"
                            onClick={() => handleReview(item.id, 'rejected')}
                            disabled={actionInProgress === item.id}
                            className="rounded-lg p-1.5 border border-[#FF375F]/30 bg-[#FF375F]/10 text-[#FF375F] hover:bg-[#FF375F]/20 transition disabled:opacity-40"
                            aria-label="Reject"
                          >
                            <X size={14} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Approve">
                          <button
                            type="button"
                            onClick={() => handleReview(item.id, 'approved')}
                            disabled={actionInProgress === item.id}
                            className="rounded-lg p-1.5 border border-[#30D158]/30 bg-[#30D158]/10 text-[#30D158] hover:bg-[#30D158]/20 transition disabled:opacity-40"
                            aria-label="Approve"
                          >
                            <Check size={14} />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Refresh button */}
              <button
                type="button"
                onClick={fetchPending}
                disabled={loading}
                className="w-full rounded-xl px-3 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-300 bg-white/[0.02] border border-[var(--color-border)] hover:bg-white/[0.05] transition"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminShowcase;
