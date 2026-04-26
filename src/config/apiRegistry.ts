export type ApiProvider = 'replicate' | 'gemini' | 'stripe' | 'supabase';
export type ApiRuntime = 'nodejs' | 'edge' | 'client';

export interface ApiParam {
  key: string;
  value: string | number | boolean;
  note?: string;
}

export interface ApiTool {
  id: string;
  name: string;
  description: string;
  provider: ApiProvider;
  model: string;
  modelVersion?: string;
  replicateUrl?: string;
  endpoint: string;
  runtime: ApiRuntime;
  maxDuration?: number;
  params: ApiParam[];
  prompt?: string;
  chainedModels?: { model: string; purpose: string; replicateUrl?: string; params: ApiParam[] }[];
  costEstimate?: string;
  notes?: string;
}

export interface GeminiFunction {
  id: string;
  name: string;
  description: string;
  model: string;
  fallbackModel?: string;
  temperature?: number;
  runtime: 'client';
  serviceFile: string;
  isPro?: boolean;
  notes?: string;
}

export interface PipelineStep {
  tool: string;
  label: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
}

// ---------------------------------------------------------------------------
// Replicate / Server-side tools
// ---------------------------------------------------------------------------

export const API_TOOLS: ApiTool[] = [
  {
    id: 'smart-cleanup',
    name: 'Smart Cleanup',
    description: 'AI-powered clutter removal using Flux 2 Pro. Preserves architecture and furniture, removes personal items and mess.',
    provider: 'replicate',
    model: 'black-forest-labs/flux-2-pro',
    replicateUrl: 'https://replicate.com/black-forest-labs/flux-2-pro',
    endpoint: '/api/flux-cleanup',
    runtime: 'nodejs',
    maxDuration: 120,
    params: [
      { key: 'input_images', value: '[dataUrl]', note: 'Array — SDK auto-uploads data URIs to temp HTTPS URLs' },
      { key: 'output_format', value: 'jpg' },
      { key: 'aspect_ratio', value: 'match_input_image' },
    ],
    prompt: 'Remove all clutter, personal items, and temporary objects from this {room}. Keep all furniture and architecture exactly as-is. Do not add anything.',
    chainedModels: [
      {
        model: 'nightmareai/real-esrgan',
        purpose: '4x upscale (optional, skippable)',
        replicateUrl: 'https://replicate.com/nightmareai/real-esrgan',
        params: [
          { key: 'scale', value: 4 },
          { key: 'face_enhance', value: false },
        ],
      },
    ],
    costEstimate: '~$0.05/image (Flux) + ~$0.01 (ESRGAN)',
    notes: 'Custom prompt override supported via Design Direction toggle (useFlux). Client resizes to 1280px max edge before upload.',
  },
  {
    id: 'day-to-dusk',
    name: 'Day to Dusk',
    description: 'Transforms daytime exterior photos into professional twilight shots using Flux 2 Pro multi-reference style transfer.',
    provider: 'replicate',
    model: 'black-forest-labs/flux-2-pro',
    replicateUrl: 'https://replicate.com/black-forest-labs/flux-2-pro',
    endpoint: '/api/flux-twilight',
    runtime: 'nodejs',
    maxDuration: 120,
    params: [
      { key: 'input_images', value: '[userPhoto, referencePhoto]', note: 'Image 1 = user photo, Image 2 = curated style reference' },
      { key: 'output_format', value: 'jpg' },
      { key: 'aspect_ratio', value: 'match_input_image' },
    ],
    prompt: 'Transform image 1 into professional twilight matching image 2. JSON-structured style prompt per variant.',
    chainedModels: [
      {
        model: 'nightmareai/real-esrgan',
        purpose: '4x upscale (always runs)',
        replicateUrl: 'https://replicate.com/nightmareai/real-esrgan',
        params: [
          { key: 'scale', value: 4 },
          { key: 'face_enhance', value: false },
        ],
      },
    ],
    costEstimate: '~$0.05/image (Flux) + ~$0.01 (ESRGAN)',
    notes: '3 style variants: warm-classic, modern-dramatic, golden-luxury. Each has a JSON prompt with color_palette hex codes. Reference images in public/references/twilight/.',
  },
  {
    id: 'sam-masks',
    name: 'SAM 2 Mask Detection',
    description: 'Automatic object segmentation for Smart Cleanup mask selection. Users toggle individual masks on/off.',
    provider: 'replicate',
    model: 'meta/sam-2',
    modelVersion: 'cbd95fb76192174268b6b303aeeb7a736e8dab0cbc38177f09db79b2299da30b',
    replicateUrl: 'https://replicate.com/meta/sam-2',
    endpoint: '/api/sam-detect',
    runtime: 'nodejs',
    maxDuration: 60,
    params: [
      { key: 'points_per_side', value: 32, note: 'Grid density for automatic mask generation' },
      { key: 'pred_iou_thresh', value: 0.92, note: 'Confidence threshold — higher = fewer, better masks' },
    ],
    costEstimate: '~$0.007/prediction',
    notes: 'Uses direct Replicate HTTP API (not SDK) with Prefer: wait=55 for long-polling. Capped at 30 individual masks. Client applies ~24px dilation blur for shadow halos.',
  },
];

// ---------------------------------------------------------------------------
// Gemini client-side functions
// ---------------------------------------------------------------------------

export const GEMINI_FUNCTIONS: GeminiFunction[] = [
  {
    id: 'detect-room',
    name: 'Room Detection',
    description: 'Classifies uploaded photo into room type for style pack selection',
    model: 'gemini-3-flash-preview',
    temperature: 0.1,
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → detectRoomType()',
  },
  {
    id: 'generate-design',
    name: 'Virtual Staging',
    description: 'AI-generates staged room images with selected style pack',
    model: 'gemini-3-pro-image-preview (Pro) / gemini-3.1-flash-image-preview (Free)',
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → generateRoomDesign()',
    isPro: true,
    notes: 'Model selected via geminiImageModelPolicy.ts. Pro tier gets gemini-3-pro first, falls back to 3.1-flash on 503.',
  },
  {
    id: 'auto-arrange',
    name: 'Auto Arrange Layout',
    description: 'AI analyzes room and recommends furniture placement',
    model: 'gemini-3-flash-preview',
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → autoArrangeLayout()',
  },
  {
    id: 'analyze-colors',
    name: 'Color Analysis',
    description: 'Extracts dominant color palette from uploaded photo',
    model: 'gemini-3-flash-preview',
    temperature: 0.2,
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → analyzeRoomColors()',
  },
  {
    id: 'sky-replace',
    name: 'Sky Replacement',
    description: 'Replaces sky in exterior photos with selected style (blue, dramatic, golden, stormy)',
    model: 'gemini-3-pro-image-preview (Pro) / gemini-3.1-flash-image-preview (Free)',
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → replaceSky()',
    isPro: true,
    notes: 'Still on Gemini — candidate for Flux 2 Pro migration.',
  },
  {
    id: 'instant-declutter',
    name: 'Instant Declutter (Gemini)',
    description: 'Quick declutter via Gemini image editing — Design Direction uses this or Flux toggle',
    model: 'gemini-3-pro-image-preview (Pro) / gemini-3.1-flash-image-preview (Free)',
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → instantDeclutter()',
    isPro: true,
  },
  {
    id: 'virtual-renovation',
    name: 'Virtual Renovation',
    description: 'AI-powered room renovation with text prompts',
    model: 'gemini-3.1-flash-image-preview',
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → virtualRenovation()',
  },
  {
    id: 'listing-copy',
    name: 'Listing Copy Generator',
    description: 'Generates MLS descriptions, social captions, hashtags',
    model: 'gemini-3-flash-preview',
    temperature: 0.8,
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → generateListingCopy()',
  },
  {
    id: 'style-advisor',
    name: 'Style Advisor',
    description: 'Analyzes photo and recommends top 3 staging styles',
    model: 'gemini-3-flash-preview',
    temperature: 0.4,
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → analyzeAndRecommendStyles()',
  },
  {
    id: 'quality-score',
    name: 'Quality Score',
    description: 'Evaluates staged images on architectural integrity, lighting, realism, perspective',
    model: 'gemini-3-flash-preview',
    temperature: 0.2,
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → scoreGeneratedImage()',
  },
  {
    id: 'listing-descriptions',
    name: 'Listing Descriptions',
    description: 'Generates full property descriptions in luxury, casual, and investment tones',
    model: 'gemini-3-flash-preview',
    temperature: 0.8,
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → generateListingDescriptions()',
  },
  {
    id: 'chat-session',
    name: 'Design Chat',
    description: 'Interactive design conversation with image context',
    model: 'gemini-2.5-pro-preview-05-06',
    runtime: 'client',
    serviceFile: 'services/geminiService.ts → createChatSession() / sendMessageToChat()',
    notes: 'Uses Pro model for higher quality conversational responses.',
  },
];

// ---------------------------------------------------------------------------
// Pipeline definitions — how tools chain together
// ---------------------------------------------------------------------------

export const PIPELINES: Pipeline[] = [
  {
    id: 'smart-cleanup-full',
    name: 'Smart Cleanup (Full)',
    description: 'SAM 2 mask detection → user selects masks → Flux 2 Pro cleanup → ESRGAN 4x → sharpen',
    steps: [
      { tool: 'sam-masks', label: 'Detect object masks' },
      { tool: 'ui', label: 'User selects clutter masks' },
      { tool: 'smart-cleanup', label: 'Flux 2 Pro removes selected items' },
      { tool: 'esrgan', label: 'Real-ESRGAN 4x upscale' },
      { tool: 'sharpen', label: 'Client-side sharpen (0.4 amount)' },
      { tool: 'resize', label: 'Resize to match original dimensions' },
    ],
  },
  {
    id: 'smart-cleanup-prompt',
    name: 'Smart Cleanup (Prompt-only)',
    description: 'Flux 2 Pro cleanup without mask selection — used when SAM fails or user skips masks',
    steps: [
      { tool: 'smart-cleanup', label: 'Flux 2 Pro removes clutter by prompt' },
      { tool: 'esrgan', label: 'Real-ESRGAN 4x upscale' },
      { tool: 'sharpen', label: 'Client-side sharpen' },
      { tool: 'resize', label: 'Resize to match original' },
    ],
  },
  {
    id: 'day-to-dusk-full',
    name: 'Day to Dusk',
    description: 'User selects twilight style → Flux 2 Pro relights with reference image → ESRGAN 4x → sharpen',
    steps: [
      { tool: 'ui', label: 'User picks style (warm-classic / modern-dramatic / golden-luxury)' },
      { tool: 'day-to-dusk', label: 'Flux 2 Pro relights scene' },
      { tool: 'esrgan', label: 'Real-ESRGAN 4x upscale' },
      { tool: 'sharpen', label: 'Client-side sharpen' },
      { tool: 'resize', label: 'Resize to match original' },
    ],
  },
  {
    id: 'virtual-staging-full',
    name: 'Virtual Staging',
    description: 'Room detection → style selection → Gemini image generation → composite → sharpen',
    steps: [
      { tool: 'detect-room', label: 'Detect room type' },
      { tool: 'ui', label: 'User selects style pack' },
      { tool: 'generate-design', label: 'Gemini generates staged image' },
      { tool: 'composite', label: 'stackComposite blends with original' },
      { tool: 'sharpen', label: 'Client-side sharpen' },
    ],
  },
  {
    id: 'design-direction-flux',
    name: 'Design Direction (Flux Engine)',
    description: 'Text prompt → Flux 2 Pro with custom prompt → sharpen → resize',
    steps: [
      { tool: 'ui', label: 'User writes removal/edit prompt' },
      { tool: 'smart-cleanup', label: 'Flux 2 Pro with custom prompt' },
      { tool: 'sharpen', label: 'Client-side sharpen' },
      { tool: 'resize', label: 'Resize to match original' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Environment variables the system needs
// ---------------------------------------------------------------------------

export interface EnvVar {
  key: string;
  location: 'server' | 'client';
  required: boolean;
  description: string;
}

export const ENV_VARS: EnvVar[] = [
  { key: 'REPLICATE_API_TOKEN', location: 'server', required: true, description: 'Replicate API auth — powers Flux, ESRGAN, SAM 2' },
  { key: 'VITE_GEMINI_API_KEY', location: 'client', required: true, description: 'Google Gemini API key (fallback if user hasn\'t set their own)' },
  { key: 'VITE_GOOGLE_CLIENT_ID', location: 'client', required: true, description: 'Google OAuth client ID for sign-in' },
  { key: 'STRIPE_SECRET_KEY', location: 'server', required: true, description: 'Stripe secret key for checkout/billing' },
  { key: 'SUPABASE_URL', location: 'server', required: true, description: 'Supabase project URL' },
  { key: 'SUPABASE_SERVICE_KEY', location: 'server', required: true, description: 'Supabase service role key' },
];

// ---------------------------------------------------------------------------
// Upload constraints
// ---------------------------------------------------------------------------

export const UPLOAD_CONSTRAINTS = {
  maxEdge: 1280,
  note: 'All images resized to 1280px max edge before upload — Vercel body limit is ~4.5 MB',
  upscaleOutput: '~5120px (4x via ESRGAN)',
};
