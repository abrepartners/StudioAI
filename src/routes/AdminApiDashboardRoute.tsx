import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { readGoogleUser } from './authStorage';
import {
  API_TOOLS,
  GEMINI_FUNCTIONS,
  PIPELINES,
  ENV_VARS,
  UPLOAD_CONSTRAINTS,
  type ApiTool,
  type GeminiFunction,
  type Pipeline,
} from '../config/apiRegistry';
import Badge from '../../components/ui/Badge';
import {
  Server,
  Cpu,
  Workflow,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Zap,
  Eye,
  ArrowRight,
  Settings2,
  Shield,
} from 'lucide-react';

const OWNER_EMAIL = 'book@averyandbryant.com';
const isOwner = (email: string) => email === OWNER_EMAIL;

type Tab = 'replicate' | 'gemini' | 'pipelines' | 'env';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'replicate', label: 'Replicate APIs', icon: Server },
  { key: 'gemini', label: 'Gemini Functions', icon: Cpu },
  { key: 'pipelines', label: 'Pipelines', icon: Workflow },
  { key: 'env', label: 'Environment', icon: Shield },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-zinc-400 hover:text-white transition-all duration-200"
      title="Copy to clipboard"
    >
      {copied ? <Check size={10} className="text-[#30D158]" /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function ParamRow({ label, value, note }: { label: string; value: string | number | boolean; note?: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <code className="text-[11px] text-[#0A84FF] bg-[#0A84FF]/10 px-1.5 py-0.5 rounded font-mono shrink-0">{label}</code>
      <code className="text-[11px] text-zinc-300 font-mono">{String(value)}</code>
      {note && <span className="text-[10px] text-zinc-500 italic">{note}</span>}
    </div>
  );
}

function ToolCard({ tool }: { tool: ApiTool }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-zinc-900/50 border border-white/[0.08] rounded-2xl overflow-hidden transition-all duration-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-start gap-4 text-left hover:bg-white/[0.02] transition-all duration-200"
      >
        <div className="shrink-0 mt-0.5">
          {expanded ? <ChevronDown size={16} className="text-zinc-500" /> : <ChevronRight size={16} className="text-zinc-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-white">{tool.name}</h3>
            <Badge tone="primary">{tool.provider}</Badge>
            <Badge tone="neutral">{tool.runtime}</Badge>
            {tool.costEstimate && <span className="text-[10px] text-zinc-500">{tool.costEstimate}</span>}
          </div>
          <p className="mt-1 text-xs text-zinc-400">{tool.description}</p>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-0 space-y-4 border-t border-white/[0.06]">
          {/* Model */}
          <div className="pt-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Model</div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs text-white font-mono bg-white/5 px-2 py-1 rounded border border-white/10">{tool.model}</code>
              <CopyButton text={tool.model} />
              {tool.replicateUrl && (
                <a href={tool.replicateUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#0A84FF] hover:text-[#409CFF] transition">
                  Open in Replicate <ExternalLink size={10} />
                </a>
              )}
            </div>
            {tool.modelVersion && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] text-zinc-500">Version:</span>
                <code className="text-[10px] text-zinc-400 font-mono">{tool.modelVersion.slice(0, 12)}…</code>
                <CopyButton text={tool.modelVersion} />
              </div>
            )}
          </div>

          {/* Endpoint */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Endpoint</div>
            <div className="flex items-center gap-2">
              <code className="text-xs text-zinc-300 font-mono">{tool.endpoint}</code>
              {tool.maxDuration && <span className="text-[10px] text-zinc-500">max {tool.maxDuration}s</span>}
            </div>
          </div>

          {/* Params */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Parameters</div>
            <div className="bg-black/40 rounded-xl border border-white/[0.06] px-3 py-2">
              {tool.params.map((p) => <ParamRow key={p.key} label={p.key} value={p.value} note={p.note} />)}
            </div>
          </div>

          {/* Prompt */}
          {tool.prompt && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Default Prompt</div>
                <CopyButton text={tool.prompt} />
              </div>
              <div className="bg-black/40 rounded-xl border border-white/[0.06] px-3 py-2">
                <p className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">{tool.prompt}</p>
              </div>
            </div>
          )}

          {/* Chained models */}
          {tool.chainedModels && tool.chainedModels.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Chained Models</div>
              {tool.chainedModels.map((cm) => (
                <div key={cm.model} className="bg-black/40 rounded-xl border border-white/[0.06] px-3 py-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs text-white font-mono">{cm.model}</code>
                    <span className="text-[10px] text-zinc-500">— {cm.purpose}</span>
                    <CopyButton text={cm.model} />
                    {cm.replicateUrl && (
                      <a href={cm.replicateUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[#0A84FF] hover:text-[#409CFF] transition">
                        Replicate <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  {cm.params.map((p) => <ParamRow key={p.key} label={p.key} value={p.value} />)}
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {tool.notes && (
            <div className="text-xs text-zinc-500 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
              {tool.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GeminiFunctionCard({ fn }: { fn: GeminiFunction }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-zinc-900/50 border border-white/[0.08] rounded-2xl overflow-hidden transition-all duration-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-start gap-4 text-left hover:bg-white/[0.02] transition-all duration-200"
      >
        <div className="shrink-0 mt-0.5">
          {expanded ? <ChevronDown size={16} className="text-zinc-500" /> : <ChevronRight size={16} className="text-zinc-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-white">{fn.name}</h3>
            <Badge tone="warn">gemini</Badge>
            {fn.isPro && <Badge tone="primary">PRO</Badge>}
            {fn.temperature !== undefined && <span className="text-[10px] text-zinc-500">temp {fn.temperature}</span>}
          </div>
          <p className="mt-1 text-xs text-zinc-400">{fn.description}</p>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-0 space-y-3 border-t border-white/[0.06]">
          <div className="pt-4">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Model</div>
            <div className="flex items-center gap-2">
              <code className="text-xs text-white font-mono bg-white/5 px-2 py-1 rounded border border-white/10">{fn.model}</code>
              <CopyButton text={fn.model.split(' ')[0]} />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Source</div>
            <code className="text-xs text-zinc-300 font-mono">{fn.serviceFile}</code>
          </div>
          {fn.notes && (
            <div className="text-xs text-zinc-500 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
              {fn.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineCard({ pipeline }: { pipeline: Pipeline }) {
  return (
    <div className="bg-zinc-900/50 border border-white/[0.08] rounded-2xl px-5 py-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{pipeline.name}</h3>
        <p className="mt-0.5 text-xs text-zinc-400">{pipeline.description}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {pipeline.steps.map((step, i) => (
          <React.Fragment key={i}>
            <div className="flex items-center gap-1.5 bg-black/40 border border-white/[0.06] rounded-lg px-2.5 py-1.5">
              {step.tool === 'ui' ? <Eye size={12} className="text-[#0A84FF] shrink-0" /> : <Zap size={12} className="text-zinc-500 shrink-0" />}
              <span className="text-[11px] text-zinc-300">{step.label}</span>
            </div>
            {i < pipeline.steps.length - 1 && <ArrowRight size={12} className="text-zinc-600 shrink-0" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

const AdminApiDashboardRoute: React.FC = () => {
  const navigate = useNavigate();
  const user = useMemo(() => readGoogleUser(), []);
  const [activeTab, setActiveTab] = useState<Tab>('replicate');

  useEffect(() => {
    if (!user || !isOwner(user.email)) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    document.title = 'API Dashboard · Admin · StudioAI';
  }, []);

  if (!user || !isOwner(user.email)) return null;

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      {/* Header */}
      <header className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-display text-lg tracking-tight">StudioAI</Link>
          <nav className="flex items-center gap-4 text-xs text-zinc-400">
            <Link to="/" className="hover:text-white transition">Studio</Link>
            <Link to="/listings" className="hover:text-white transition">Listings</Link>
            <Link to="/settings/brand" className="hover:text-white transition">Settings</Link>
            <Link to="/admin/pack-matrix" className="hover:text-white transition">Pack Matrix</Link>
            <span className="text-white font-semibold">API Dashboard</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <img src={user.picture} alt={user.name} referrerPolicy="no-referrer" className="w-7 h-7 rounded-full ring-1 ring-white/20" />
          <span className="hidden sm:inline text-xs text-zinc-400">{user.email}</span>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-8">
        {/* Title + stats */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Settings2 size={20} className="text-[#0A84FF]" />
              API Dashboard
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Every model, prompt, and parameter running in production. Copy slugs to test in Replicate.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <div><span className="text-zinc-300 font-semibold">{API_TOOLS.length}</span> Replicate tools</div>
            <div><span className="text-zinc-300 font-semibold">{GEMINI_FUNCTIONS.length}</span> Gemini functions</div>
            <div><span className="text-zinc-300 font-semibold">{PIPELINES.length}</span> pipelines</div>
          </div>
        </div>

        {/* Upload constraint banner */}
        <div className="bg-[#0A84FF]/5 border border-[#0A84FF]/20 rounded-xl px-4 py-2.5 mb-6 flex items-center gap-3 text-xs">
          <Zap size={14} className="text-[#0A84FF] shrink-0" />
          <span className="text-zinc-300">
            All uploads resized to <code className="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-[10px]">{UPLOAD_CONSTRAINTS.maxEdge}px</code> max edge before sending.
            ESRGAN outputs at <code className="px-1 py-0.5 rounded bg-white/5 border border-white/10 text-[10px]">{UPLOAD_CONSTRAINTS.upscaleOutput}</code>.
          </span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-white/[0.06] pb-px">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={[
                'flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-t-lg transition-all duration-200 border-b-2',
                activeTab === key
                  ? 'text-white border-[#0A84FF] bg-white/[0.03]'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-white/[0.02]',
              ].join(' ')}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'replicate' && (
          <div className="space-y-3">
            {API_TOOLS.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
          </div>
        )}

        {activeTab === 'gemini' && (
          <div className="space-y-3">
            {GEMINI_FUNCTIONS.map((fn) => <GeminiFunctionCard key={fn.id} fn={fn} />)}
          </div>
        )}

        {activeTab === 'pipelines' && (
          <div className="space-y-3">
            {PIPELINES.map((p) => <PipelineCard key={p.id} pipeline={p} />)}
          </div>
        )}

        {activeTab === 'env' && (
          <div className="space-y-3">
            {ENV_VARS.map((v) => (
              <div key={v.key} className="bg-zinc-900/50 border border-white/[0.08] rounded-2xl px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-white font-mono">{v.key}</code>
                    <Badge tone={v.required ? 'danger' : 'neutral'}>{v.required ? 'required' : 'optional'}</Badge>
                    <Badge tone={v.location === 'server' ? 'primary' : 'warn'}>{v.location}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{v.description}</p>
                </div>
                <CopyButton text={v.key} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminApiDashboardRoute;
