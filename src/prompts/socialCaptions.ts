/**
 * socialCaptions.ts — AI Prompt Templates for Social Media Captions
 * Task 1.6 — Platform-specific captions, hashtags, CTAs
 */

export interface SocialCaptionInput {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  price: number;
  propertyType?: string;
  neighborhood?: string;
  agentName?: string;
  agentHandle?: string;
}

export function generateSocialCaptionsPrompt(input: SocialCaptionInput): string {
  const { address, beds, baths, sqft, price, propertyType, neighborhood, agentName, agentHandle } = input;

  return `You are a top-performing real estate social media specialist. Create platform-optimized captions for this property listing.

PROPERTY:
- Address: ${address}
- ${beds} bedrooms, ${baths} bathrooms, ${sqft.toLocaleString()} sq ft
- Price: $${price.toLocaleString()}
${propertyType ? `- Type: ${propertyType}` : ''}
${neighborhood ? `- Neighborhood: ${neighborhood}` : ''}
${agentName ? `- Agent: ${agentName}` : ''}

GENERATE CAPTIONS FOR EACH PLATFORM:

1. **INSTAGRAM FEED** (max 2,200 chars)
   - Hook in first line (this shows before "more")
   - 2-3 paragraphs with line breaks
   - Lifestyle-focused: paint a picture of living there
   - Include property highlights naturally
   - End with CTA (DM, link in bio, open house date)
   - 25-30 hashtags: mix of broad (#realestate #dreamhome) and specific (#${neighborhood?.replace(/\s/g, '') || 'luxuryliving'} #${propertyType?.replace(/\s/g, '').toLowerCase() || 'home'}forsale)
   ${agentHandle ? `- Tag: ${agentHandle}` : ''}

2. **INSTAGRAM STORY** (max 3 lines)
   - Single punchy hook
   - Price or key stat
   - "Swipe up" or "DM for details" CTA
   - Design for overlay on photo

3. **FACEBOOK POST** (max 500 chars)
   - Professional but warm tone
   - Neighborhood/community context
   - Include key specs inline
   - Direct CTA to schedule showing
   - No hashtags (Facebook doesn't use them)

4. **TWITTER/X POST** (max 280 chars)
   - Punchy, one-liner energy
   - Lead with the most impressive feature
   - Include price
   - 2-3 hashtags max

5. **LINKEDIN POST** (max 700 chars)
   - Professional investment angle
   - Market context (why now, area growth)
   - Position as opportunity
   - Subtle CTA

FORMAT (use these exact delimiters):
---INSTAGRAM_FEED---
[caption]
---INSTAGRAM_STORY---
[caption]
---FACEBOOK_POST---
[caption]
---TWITTER_POST---
[caption]
---LINKEDIN_POST---
[caption]`;
}

// Hashtag library by category
export const HASHTAG_SETS = {
  general: ['#realestate', '#realtor', '#home', '#property', '#forsale', '#listing', '#househunting', '#newhome', '#dreamhome', '#homesforsale'],
  luxury: ['#luxuryrealestate', '#luxuryhomes', '#luxuryliving', '#milliondollarlisting', '#luxurylifestyle', '#estateforsale', '#premiumproperty'],
  investment: ['#realestateinvesting', '#investmentproperty', '#passiveincome', '#rentalincome', '#realestateinvestor', '#cashflow'],
  staging: ['#virtualstaging', '#stagedtosell', '#homestaging', '#stagingworks', '#interiordesign', '#homedecor'],
  firstTime: ['#firsttimebuyer', '#firsthome', '#starterHome', '#homeownership', '#buyingahouse'],
  location: (city: string, state: string) => [
    `#${city.replace(/\s/g, '')}realestate`,
    `#${city.replace(/\s/g, '')}homes`,
    `#${state}realestate`,
    `#${city.replace(/\s/g, '')}living`,
  ],
};
