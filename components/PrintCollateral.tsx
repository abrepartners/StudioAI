/**
 * PrintCollateral.tsx — Print Material Generator UI
 * Task 1.5 — Template selector, preview, PDF download
 *
 * Dependencies: @react-pdf/renderer, qrcode
 * Install: npm install @react-pdf/renderer qrcode @types/qrcode
 */

import React, { useState, useCallback } from 'react';
import {
  Printer,
  FileText,
  Home,
  Mail,
  Download,
  Check,
  Loader2,
  Eye,
} from 'lucide-react';
import { useBrandKit } from '../hooks/useBrandKit';

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateType = 'flyer' | 'openhouse' | 'postcard';

interface PrintCollateralProps {
  listingData?: {
    address: string;
    beds: number;
    baths: number;
    sqft: number;
    price: number;
    description: string;
    photos: string[];          // data URLs
    propertyWebsiteUrl?: string;
  };
}

interface TemplateConfig {
  type: TemplateType;
  label: string;
  description: string;
  icon: React.ElementType;
  size: string;
  pages: number;
}

const TEMPLATES: TemplateConfig[] = [
  {
    type: 'flyer',
    label: 'Property Flyer',
    description: 'Single-page 8.5×11 with hero image, details, and agent card',
    icon: FileText,
    size: '8.5" × 11"',
    pages: 1,
  },
  {
    type: 'openhouse',
    label: 'Open House Sheet',
    description: 'Sign-in sheet with property overview, QR code, and map',
    icon: Home,
    size: '8.5" × 11"',
    pages: 2,
  },
  {
    type: 'postcard',
    label: 'Just Listed Postcard',
    description: 'Front/back 6×4 postcard with hero and agent branding',
    icon: Mail,
    size: '6" × 4"',
    pages: 2,
  },
];

// ─── PDF Generation (Dynamic Import) ─────────────────────────────────────────

async function generatePDF(
  template: TemplateType,
  listingData: PrintCollateralProps['listingData'],
  brandKit: ReturnType<typeof useBrandKit>['brandKit']
): Promise<Blob> {
  // Dynamic import to avoid loading @react-pdf/renderer on page load
  const { Document, Page, Text, View, Image, StyleSheet, pdf } = await import(
    '@react-pdf/renderer'
  );
  const QRCode = (await import('qrcode')).default;

  const primary = brandKit.primaryColor || '#0A84FF';
  const data = listingData!;
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(data.price);

  // Generate QR code data URL
  let qrDataUrl = '';
  if (data.propertyWebsiteUrl) {
    qrDataUrl = await QRCode.toDataURL(data.propertyWebsiteUrl, {
      width: 200,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  }

  const styles = StyleSheet.create({
    page: { padding: 0, fontFamily: 'Helvetica' },
    hero: { width: '100%', height: 300, objectFit: 'cover' },
    body: { padding: 30 },
    title: { fontSize: 24, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 4 },
    price: { fontSize: 28, fontWeight: 'bold', color: primary, marginBottom: 12 },
    specs: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    specItem: { fontSize: 12, color: '#6B7280' },
    specValue: { fontWeight: 'bold', color: '#1C1C1E' },
    description: { fontSize: 10, color: '#4B5563', lineHeight: 1.6, marginBottom: 20 },
    agentCard: {
      flexDirection: 'row', gap: 12, padding: 16,
      backgroundColor: '#F9FAFB', borderRadius: 8, marginTop: 'auto',
    },
    agentPhoto: { width: 50, height: 50, borderRadius: 25 },
    agentName: { fontSize: 14, fontWeight: 'bold', color: '#1C1C1E' },
    agentDetail: { fontSize: 9, color: '#6B7280', marginTop: 2 },
    qr: { width: 60, height: 60, marginLeft: 'auto' },
    footer: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 4, backgroundColor: primary,
    },
  });

  let doc;

  if (template === 'flyer') {
    doc = (
      <Document>
        <Page size="LETTER" style={styles.page}>
          {data.photos[0] && <Image src={data.photos[0]} style={styles.hero} />}
          <View style={styles.body}>
            <Text style={styles.price}>{formattedPrice}</Text>
            <Text style={styles.title}>{data.address}</Text>
            <View style={styles.specs}>
              <Text style={styles.specItem}><Text style={styles.specValue}>{data.beds}</Text> Beds</Text>
              <Text style={styles.specItem}><Text style={styles.specValue}>{data.baths}</Text> Baths</Text>
              <Text style={styles.specItem}><Text style={styles.specValue}>{data.sqft.toLocaleString()}</Text> Sq Ft</Text>
            </View>
            <Text style={styles.description}>
              {data.description?.slice(0, 600) || 'Property description will appear here.'}
            </Text>
            <View style={styles.agentCard}>
              {brandKit.headshot && <Image src={brandKit.headshot} style={styles.agentPhoto} />}
              <View>
                <Text style={styles.agentName}>{brandKit.agentName || 'Agent Name'}</Text>
                <Text style={styles.agentDetail}>{brandKit.brokerageName}</Text>
                <Text style={styles.agentDetail}>{brandKit.phone}</Text>
                <Text style={styles.agentDetail}>{brandKit.email}</Text>
              </View>
              {qrDataUrl && <Image src={qrDataUrl} style={styles.qr} />}
            </View>
          </View>
          <View style={styles.footer} />
        </Page>
      </Document>
    );
  } else if (template === 'openhouse') {
    doc = (
      <Document>
        <Page size="LETTER" style={styles.page}>
          {data.photos[0] && <Image src={data.photos[0]} style={{ ...styles.hero, height: 200 }} />}
          <View style={styles.body}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: primary, marginBottom: 4 }}>
              Open House
            </Text>
            <Text style={styles.title}>{data.address}</Text>
            <Text style={styles.price}>{formattedPrice}</Text>
            <View style={styles.specs}>
              <Text style={styles.specItem}><Text style={styles.specValue}>{data.beds}</Text> Beds</Text>
              <Text style={styles.specItem}><Text style={styles.specValue}>{data.baths}</Text> Baths</Text>
              <Text style={styles.specItem}><Text style={styles.specValue}>{data.sqft.toLocaleString()}</Text> Sq Ft</Text>
            </View>
            <Text style={styles.description}>{data.description?.slice(0, 400)}</Text>
          </View>
          <View style={styles.footer} />
        </Page>
        <Page size="LETTER" style={styles.page}>
          <View style={{ ...styles.body, paddingTop: 40 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 20 }}>
              Sign In — {data.address}
            </Text>
            {/* Sign-in table rows */}
            {Array.from({ length: 15 }, (_, i) => (
              <View key={i} style={{
                flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
                paddingVertical: 8, gap: 8,
              }}>
                <Text style={{ flex: 2, fontSize: 9, color: '#9CA3AF' }}>Name</Text>
                <Text style={{ flex: 2, fontSize: 9, color: '#9CA3AF' }}>Email</Text>
                <Text style={{ flex: 1.5, fontSize: 9, color: '#9CA3AF' }}>Phone</Text>
                <Text style={{ flex: 1, fontSize: 9, color: '#9CA3AF' }}>Agent?</Text>
              </View>
            ))}
          </View>
          <View style={styles.footer} />
        </Page>
      </Document>
    );
  } else {
    // Postcard 6x4
    doc = (
      <Document>
        <Page size={{ width: 432, height: 288 }} style={styles.page}>
          {data.photos[0] && <Image src={data.photos[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: 12, backgroundColor: 'rgba(0,0,0,0.7)',
          }}>
            <Text style={{ fontSize: 10, color: primary, fontWeight: 'bold' }}>JUST LISTED</Text>
            <Text style={{ fontSize: 14, color: '#FFFFFF', fontWeight: 'bold' }}>{formattedPrice}</Text>
            <Text style={{ fontSize: 9, color: '#D1D5DB' }}>{data.address}</Text>
          </View>
        </Page>
        <Page size={{ width: 432, height: 288 }} style={{ ...styles.page, padding: 20 }}>
          <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 4 }}>
                {data.address}
              </Text>
              <Text style={{ fontSize: 9, color: '#6B7280', lineHeight: 1.5 }}>
                {data.beds} bed | {data.baths} bath | {data.sqft.toLocaleString()} sqft{'\n'}
                {data.description?.slice(0, 200)}
              </Text>
            </View>
            <View style={{ width: 120, alignItems: 'center' }}>
              {brandKit.headshot && <Image src={brandKit.headshot} style={{ width: 50, height: 50, borderRadius: 25, marginBottom: 4 }} />}
              <Text style={{ fontSize: 9, fontWeight: 'bold', textAlign: 'center' }}>{brandKit.agentName}</Text>
              <Text style={{ fontSize: 7, color: '#6B7280', textAlign: 'center' }}>{brandKit.brokerageName}</Text>
              <Text style={{ fontSize: 7, color: '#6B7280', textAlign: 'center' }}>{brandKit.phone}</Text>
              {qrDataUrl && <Image src={qrDataUrl} style={{ width: 40, height: 40, marginTop: 4 }} />}
            </View>
          </View>
          <View style={{ ...styles.footer, height: 3 }} />
        </Page>
      </Document>
    );
  }

  const blob = await pdf(doc).toBlob();
  return blob;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PrintCollateral: React.FC<PrintCollateralProps> = ({ listingData }) => {
  const { brandKit, hasBrandKit } = useBrandKit();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('flyer');
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!listingData) return;

    setIsGenerating(true);
    setDownloadDone(false);

    try {
      const blob = await generatePDF(selectedTemplate, listingData, brandKit);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studioai_${selectedTemplate}_${listingData.address.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadDone(true);
      setTimeout(() => setDownloadDone(false), 3000);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedTemplate, listingData, brandKit]);

  const activeTemplate = TEMPLATES.find(t => t.type === selectedTemplate)!;

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-5">
      <div>
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <Printer className="w-5 h-5 text-[#0A84FF]" />
          Print Collateral
        </h3>
        <p className="text-zinc-400 text-sm mt-0.5">
          Generate branded flyers, open house sheets, and postcards as print-ready PDFs
        </p>
      </div>

      {/* Template Selector */}
      <div className="grid grid-cols-3 gap-2">
        {TEMPLATES.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.type}
              onClick={() => setSelectedTemplate(t.type)}
              className={`p-3 rounded-xl border text-left transition-all duration-200 ${
                selectedTemplate === t.type
                  ? 'bg-zinc-800 border-[#0A84FF] ring-1 ring-[#0A84FF]/30'
                  : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
              }`}
            >
              <Icon className={`w-5 h-5 mb-2 ${selectedTemplate === t.type ? 'text-[#0A84FF]' : 'text-zinc-500'}`} />
              <div className="text-xs font-medium text-white">{t.label}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{t.size} · {t.pages}pg</div>
            </button>
          );
        })}
      </div>

      {/* Template Info */}
      <div className="bg-zinc-800 rounded-lg p-3">
        <div className="text-sm font-medium text-white">{activeTemplate.label}</div>
        <div className="text-xs text-zinc-400 mt-0.5">{activeTemplate.description}</div>
      </div>

      {/* Brand Kit Status */}
      {!hasBrandKit && (
        <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
          <Printer className="w-4 h-4 text-zinc-500" />
          <span className="text-xs text-zinc-400">
            Set up your Brand Kit in Settings for branded collateral with your logo and contact info.
          </span>
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !listingData}
        className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 ${
          downloadDone
            ? 'bg-[#30D158] text-white'
            : isGenerating
              ? 'bg-zinc-700 text-zinc-400 cursor-wait'
              : !listingData
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-[#0A84FF] text-white hover:bg-blue-500 active:scale-[0.98]'
        }`}
      >
        {downloadDone ? (
          <><Check className="w-4 h-4" /> Downloaded</>
        ) : isGenerating ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF...</>
        ) : (
          <><Download className="w-4 h-4" /> Generate {activeTemplate.label}</>
        )}
      </button>
    </div>
  );
};

export default PrintCollateral;
