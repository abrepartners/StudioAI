/**
 * propertySiteTemplate.ts — Self-Contained Property Website Generator
 * Task 1.3 — Generates a single HTML file with all assets inlined
 *
 * Output: Complete HTML string with base64 images, inline CSS, og:meta tags
 * Hosting: Vercel Blob Storage or static route under /listings/
 */

import type { BrandKit } from '../hooks/useBrandKit';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PropertySiteInput {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  price: number;
  yearBuilt?: number;
  lotSize?: string;
  propertyType?: string;
  description: string;
  photos: string[];              // Array of base64 data URLs (staged images)
  brandKit: BrandKit;
  contactFormKey?: string;       // Web3Forms access key
  mapQuery?: string;             // Override for Google Maps embed
}

// ─── Template Generator ───────────────────────────────────────────────────────

export function generatePropertySiteHTML(input: PropertySiteInput): string {
  const {
    address,
    beds,
    baths,
    sqft,
    price,
    yearBuilt,
    lotSize,
    propertyType,
    description,
    photos,
    brandKit,
    contactFormKey,
    mapQuery,
  } = input;

  const primary = brandKit.primaryColor || '#0A84FF';
  const secondary = brandKit.secondaryColor || '#1C1C1E';
  const agentName = brandKit.agentName || 'Your Agent';
  const brokerage = brandKit.brokerageName || '';
  const phone = brandKit.phone || '';
  const email = brandKit.email || '';
  const website = brandKit.website || '';
  const tagline = brandKit.tagline || '';
  const logo = brandKit.logo || '';
  const headshot = brandKit.headshot || '';

  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);

  const heroImage = photos[0] || '';
  const galleryImages = photos.slice(0, 20);
  const encodedAddress = encodeURIComponent(mapQuery || address);
  const ogImage = heroImage;

  // Description paragraphs
  const descParagraphs = description
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p>${p.trim()}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${address} | ${formattedPrice} | ${agentName}</title>
  <meta name="description" content="${beds} bed, ${baths} bath, ${sqft.toLocaleString()} sqft home at ${address}. Listed by ${agentName}${brokerage ? ' at ' + brokerage : ''}.">

  <!-- Open Graph -->
  <meta property="og:title" content="${address} | ${formattedPrice}">
  <meta property="og:description" content="${beds}bd/${baths}ba | ${sqft.toLocaleString()} sqft | ${propertyType || 'Home'} listed by ${agentName}">
  <meta property="og:type" content="website">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${address} | ${formattedPrice}">

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primary: ${primary};
      --secondary: ${secondary};
      --bg: #0D0D0D;
      --card: #1C1C1E;
      --border: #2C2C2E;
      --text: #F2F2F7;
      --muted: #8E8E93;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }

    /* Hero */
    .hero {
      position: relative;
      height: 70vh;
      min-height: 500px;
      background-size: cover;
      background-position: center;
      background-image: url('${heroImage}');
    }
    .hero-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.4) 100%);
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 48px;
    }
    .hero h1 {
      font-size: clamp(28px, 4vw, 48px);
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }
    .hero .price {
      font-size: clamp(24px, 3vw, 40px);
      font-weight: 700;
      color: var(--primary);
    }
    .hero .specs {
      display: flex;
      gap: 24px;
      margin-top: 12px;
      font-size: 16px;
      color: rgba(255,255,255,0.8);
    }
    .hero .specs span { font-weight: 600; color: white; }

    /* Stats Bar */
    .stats-bar {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 20px 0;
    }
    .stats-grid {
      display: flex;
      justify-content: center;
      gap: 48px;
      flex-wrap: wrap;
    }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: var(--primary); }
    .stat-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }

    /* Sections */
    section { padding: 64px 0; }
    section h2 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 24px;
      letter-spacing: -0.01em;
    }
    .description p {
      color: var(--muted);
      font-size: 16px;
      line-height: 1.8;
      margin-bottom: 16px;
      max-width: 720px;
    }

    /* Gallery */
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }
    .gallery-grid img {
      width: 100%;
      height: 220px;
      object-fit: cover;
      border-radius: 12px;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .gallery-grid img:hover { transform: scale(1.02); }

    /* Map */
    .map-container {
      border-radius: 12px;
      overflow: hidden;
      height: 400px;
      background: var(--card);
    }
    .map-container iframe { width: 100%; height: 100%; border: 0; }

    /* Agent Card */
    .agent-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
      display: flex;
      gap: 24px;
      align-items: center;
      max-width: 600px;
    }
    .agent-photo {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--primary);
    }
    .agent-info h3 { font-size: 20px; font-weight: 700; }
    .agent-info .brokerage { color: var(--primary); font-size: 14px; margin-top: 2px; }
    .agent-info .contact { color: var(--muted); font-size: 14px; margin-top: 8px; }
    .agent-info .contact a { color: var(--primary); text-decoration: none; }

    /* Contact Form */
    .contact-form {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
      max-width: 500px;
    }
    .contact-form input,
    .contact-form textarea {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      color: var(--text);
      font-size: 14px;
      margin-bottom: 12px;
      font-family: inherit;
    }
    .contact-form input:focus,
    .contact-form textarea:focus {
      outline: none;
      border-color: var(--primary);
    }
    .contact-form button {
      width: 100%;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 14px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .contact-form button:hover { opacity: 0.9; }

    /* Footer */
    footer {
      background: var(--card);
      border-top: 1px solid var(--border);
      padding: 24px 0;
      text-align: center;
      color: var(--muted);
      font-size: 12px;
    }
    footer img { height: 32px; margin-bottom: 8px; }

    /* Responsive */
    @media (max-width: 768px) {
      .hero { height: 50vh; min-height: 350px; }
      .hero-overlay { padding: 24px; }
      .stats-grid { gap: 24px; }
      .agent-card { flex-direction: column; text-align: center; }
      section { padding: 40px 0; }
    }
  </style>
</head>
<body>

  <!-- Hero -->
  <div class="hero">
    <div class="hero-overlay">
      <h1>${address}</h1>
      <div class="price">${formattedPrice}</div>
      <div class="specs">
        <div><span>${beds}</span> Beds</div>
        <div><span>${baths}</span> Baths</div>
        <div><span>${sqft.toLocaleString()}</span> Sq Ft</div>
        ${yearBuilt ? `<div>Built <span>${yearBuilt}</span></div>` : ''}
        ${propertyType ? `<div>${propertyType}</div>` : ''}
      </div>
    </div>
  </div>

  <!-- Stats Bar -->
  <div class="stats-bar">
    <div class="container">
      <div class="stats-grid">
        <div class="stat"><div class="stat-value">${beds}</div><div class="stat-label">Bedrooms</div></div>
        <div class="stat"><div class="stat-value">${baths}</div><div class="stat-label">Bathrooms</div></div>
        <div class="stat"><div class="stat-value">${sqft.toLocaleString()}</div><div class="stat-label">Square Feet</div></div>
        ${lotSize ? `<div class="stat"><div class="stat-value">${lotSize}</div><div class="stat-label">Lot Size</div></div>` : ''}
        ${yearBuilt ? `<div class="stat"><div class="stat-value">${yearBuilt}</div><div class="stat-label">Year Built</div></div>` : ''}
      </div>
    </div>
  </div>

  <!-- Description -->
  <section>
    <div class="container">
      <h2>About This Property</h2>
      <div class="description">
        ${descParagraphs}
      </div>
    </div>
  </section>

  <!-- Gallery -->
  ${galleryImages.length > 1 ? `
  <section style="background: var(--card); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
    <div class="container">
      <h2>Photo Gallery</h2>
      <div class="gallery-grid">
        ${galleryImages.map((img, i) => `<img src="${img}" alt="Property photo ${i + 1}" loading="lazy">`).join('\n        ')}
      </div>
    </div>
  </section>
  ` : ''}

  <!-- Map -->
  <section>
    <div class="container">
      <h2>Location</h2>
      <div class="map-container">
        <iframe
          src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodedAddress}"
          allowfullscreen
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
        ></iframe>
      </div>
    </div>
  </section>

  <!-- Agent + Contact -->
  <section style="background: var(--card); border-top: 1px solid var(--border);">
    <div class="container" style="display: flex; gap: 48px; flex-wrap: wrap; align-items: flex-start;">
      <!-- Agent Card -->
      <div style="flex: 1; min-width: 280px;">
        <h2>Listed By</h2>
        <div class="agent-card" style="margin-top: 16px;">
          ${headshot ? `<img src="${headshot}" alt="${agentName}" class="agent-photo">` : ''}
          <div class="agent-info">
            <h3>${agentName}</h3>
            ${brokerage ? `<div class="brokerage">${brokerage}</div>` : ''}
            ${tagline ? `<div style="color: var(--muted); font-size: 13px; font-style: italic; margin-top: 4px;">${tagline}</div>` : ''}
            <div class="contact">
              ${phone ? `<div>${phone}</div>` : ''}
              ${email ? `<div><a href="mailto:${email}">${email}</a></div>` : ''}
              ${website ? `<div><a href="https://${website}" target="_blank">${website}</a></div>` : ''}
            </div>
          </div>
        </div>
        ${logo ? `<img src="${logo}" alt="Brokerage Logo" style="height: 40px; margin-top: 16px; opacity: 0.7;">` : ''}
      </div>

      <!-- Contact Form -->
      <div style="flex: 1; min-width: 280px;">
        <h2>Schedule a Showing</h2>
        <form class="contact-form" style="margin-top: 16px;" action="https://api.web3forms.com/submit" method="POST">
          ${contactFormKey ? `<input type="hidden" name="access_key" value="${contactFormKey}">` : ''}
          <input type="hidden" name="subject" value="Showing request for ${address}">
          <input type="text" name="name" placeholder="Your name" required>
          <input type="email" name="email" placeholder="Your email" required>
          <input type="tel" name="phone" placeholder="Phone number">
          <textarea name="message" rows="3" placeholder="I'd like to schedule a showing...">${address ? `I'm interested in ${address}.` : ''}</textarea>
          <button type="submit">Request Showing</button>
        </form>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer>
    ${logo ? `<img src="${logo}" alt="${brokerage || agentName}"><br>` : ''}
    <div>${agentName}${brokerage ? ' | ' + brokerage : ''}</div>
    <div style="margin-top: 4px;">Powered by StudioAI</div>
  </footer>

</body>
</html>`;
}
