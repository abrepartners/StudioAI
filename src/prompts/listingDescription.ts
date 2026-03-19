/**
 * MLS Listing Description Prompt Templates
 * For StudioAI - Real Estate Virtual Staging Platform
 * Generates Gemini API-ready prompts for luxury, casual, and investment-focused property descriptions
 */

export interface PropertyDetails {
  beds: number;
  baths: number;
  sqft: number;
  price: number;
  address: string;
  yearBuilt: number;
  lotSize?: number;
  lotUnit?: 'sqft' | 'acres';
  propertyType: 'Single Family' | 'Condo' | 'Townhouse' | 'Multi-Family' | 'Land';
}

export interface ListingDescriptionInput {
  roomTypes: string[];
  propertyDetails: PropertyDetails;
  agentNotes?: string;
}

/**
 * System prompt establishing AI as a luxury real estate copywriter
 * Sets tone, expertise level, and output expectations
 */
export const SYSTEM_PROMPT = `You are an elite luxury real estate copywriter with 20+ years of experience crafting MLS listings for high-value properties. You've written descriptions for properties featured in Robb Report, Architectural Digest, and luxury real estate publications.

Your expertise includes:
- Understanding architectural movements, materials, and craftsmanship across eras
- Recognizing subtle but valuable property features that differentiate luxury homes
- Articulating lifestyle value propositions beyond square footage
- Writing in a voice that matches the property's character and target buyer
- Creating descriptions that read naturally—as if written by a knowledgeable agent, not generated text

Your output should:
- Demonstrate deep knowledge of the property and location
- Use sophisticated vocabulary without being pretentious
- Include specific, observable details rather than generic claims
- Avoid marketing clichés (nestled, boasts, stunning, charming, etc.)
- Structure descriptions with clear sections that guide the reader's experience
- Target 800-1200 words
- Sound authoritative, not manufactured`;

/**
 * Luxury Tone - Premium, high-end listings emphasizing exclusivity and craftsmanship
 */
export function generateLuxuryTonePrompt(input: ListingDescriptionInput): string {
  const { roomTypes, propertyDetails, agentNotes } = input;
  const roomList = roomTypes.join(', ');

  return `${SYSTEM_PROMPT}

---

LISTING ASSIGNMENT:
Write an MLS description for this luxury property in a sophisticated, elevated tone that appeals to discerning buyers who appreciate craftsmanship and exclusivity.

PROPERTY INFORMATION:
- Address: ${propertyDetails.address}
- Type: ${propertyDetails.propertyType}
- Year Built: ${propertyDetails.yearBuilt}
- Bedrooms: ${propertyDetails.beds} | Bathrooms: ${propertyDetails.baths}
- Square Footage: ${propertyDetails.sqft.toLocaleString()}
${propertyDetails.lotSize ? `- Lot Size: ${propertyDetails.lotSize} ${propertyDetails.lotUnit || 'sqft'}` : ''}
- Asking Price: $${propertyDetails.price.toLocaleString()}
- Key Rooms: ${roomList}
${agentNotes ? `- Agent Notes: ${agentNotes}` : ''}

TONE PARAMETERS:
This description should appeal to luxury buyers by:
- Emphasizing architectural integrity and design philosophy
- Highlighting superior materials, artisanal details, and construction quality
- Contextualizing the property within broader design movements or architectural significance
- Using precise, educated language about finishes, systems, and improvements
- Suggesting a refined lifestyle rather than describing amenities
- Acknowledging the property's investment in timelessness
- Connecting features to real-world benefits (thermal efficiency, acoustics, preservation of natural light, etc.)

STRUCTURE:
Organize the description into these sections:
1. Property Overview (establish the property's character and significance)
2. Interior Architecture & Design (floor plan flow, notable spaces, architectural details)
3. Luxury Finishes & Systems (materials, hardware, kitchen/bath specifications, mechanical systems)
4. Primary Residence (bedroom spaces, closets, private areas)
5. Entertaining & Living Spaces (living room, dining, family areas, transitions to outdoor space)
6. Culinary Features (kitchen specifications, appliances, workflow)
7. Outdoor Living (landscape design, entertaining potential, views, privacy)
8. Location & Lifestyle Context (neighborhood character, proximity to culture/commerce, exclusivity factors)

WRITING GUIDELINES:
- Open with a statement that establishes the property's essence, not its features
- Use active, specific language: "The kitchen features marble quarried from..." not "This home has a marble kitchen"
- Include 2-3 concrete architectural details that demonstrate your knowledge
- Avoid: boasts, stunning, gorgeous, exquisite, prestigious, coveted, luxury, exclusive (overused terms)
- Write as if describing to another real estate professional first
- Each section should build a narrative about why this particular property matters
- Reference how spaces flow and connect
- Target 900-1100 words`;
}

/**
 * Casual Tone - Warm, approachable, lifestyle-focused for broad consumer appeal
 */
export function generateCasualTonePrompt(input: ListingDescriptionInput): string {
  const { roomTypes, propertyDetails, agentNotes } = input;
  const roomList = roomTypes.join(', ');

  return `${SYSTEM_PROMPT}

---

LISTING ASSIGNMENT:
Write an MLS description for this property in a warm, accessible tone that invites buyers to imagine their everyday life here. This should feel like a knowledgeable friend describing a home they genuinely know.

PROPERTY INFORMATION:
- Address: ${propertyDetails.address}
- Type: ${propertyDetails.propertyType}
- Year Built: ${propertyDetails.yearBuilt}
- Bedrooms: ${propertyDetails.beds} | Bathrooms: ${propertyDetails.baths}
- Square Footage: ${propertyDetails.sqft.toLocaleString()}
${propertyDetails.lotSize ? `- Lot Size: ${propertyDetails.lotSize} ${propertyDetails.lotUnit || 'sqft'}` : ''}
- Asking Price: $${propertyDetails.price.toLocaleString()}
- Key Rooms: ${roomList}
${agentNotes ? `- Agent Notes: ${agentNotes}` : ''}

TONE PARAMETERS:
This description should connect with buyers emotionally by:
- Describing how everyday moments feel in this space
- Highlighting what makes the neighborhood livable and fun
- Using conversational, genuine language without being overly casual
- Focusing on experiences and quality of life, not just features
- Acknowledging practical considerations (storage, traffic flow, natural light)
- Making readers feel the personality of the space
- Painting pictures of weekend mornings, dinner parties, quiet evenings
- Being honest about what works well here

STRUCTURE:
Organize the description into these sections:
1. Welcome (set the tone; describe the first impression)
2. Main Living Spaces (living room, family room, how the home flows)
3. Kitchen (organized around how people actually use kitchens)
4. Bedrooms & Bathrooms (comfort, privacy, practical features)
5. Outdoor Space (backyard potential, views, how it extends the home)
6. Neighborhood (walkability, nearby favorites, community character, schools if relevant)
7. What Makes This Home Special (honest standout features, unique characteristics)

WRITING GUIDELINES:
- Start with a vivid but genuine scene: "Morning light floods the kitchen..." or "The back patio is where this house comes alive..."
- Use "you" language: "You'll appreciate...", "Imagine...", "You have direct access..."
- Include sensory details: light quality, space flow, how room sizes feel
- Avoid: nestled, charming, quaint, picture-perfect, dream home, magical, cozy (when overused)
- Be specific about practical things: "The master bath has double vanities and space for a soaking tub"
- Include honest details about traffic, commute times, or local attractions
- Write as if you're telling someone about a home you genuinely recommend
- Balance enthusiasm with credibility—acknowledge trade-offs or practical considerations
- Target 850-1100 words`;
}

/**
 * Investment Tone - Data-driven, ROI-focused, analytical for investor appeal
 */
export function generateInvestmentTonePrompt(input: ListingDescriptionInput): string {
  const { roomTypes, propertyDetails, agentNotes } = input;
  const roomList = roomTypes.join(', ');

  return `${SYSTEM_PROMPT}

---

LISTING ASSIGNMENT:
Write an MLS description for this property emphasizing investment fundamentals, value proposition, and return potential. This targets experienced real estate investors analyzing opportunities.

PROPERTY INFORMATION:
- Address: ${propertyDetails.address}
- Type: ${propertyDetails.propertyType}
- Year Built: ${propertyDetails.yearBuilt}
- Bedrooms: ${propertyDetails.beds} | Bathrooms: ${propertyDetails.baths}
- Square Footage: ${propertyDetails.sqft.toLocaleString()}
${propertyDetails.lotSize ? `- Lot Size: ${propertyDetails.lotSize} ${propertyDetails.lotUnit || 'sqft'}` : ''}
- Asking Price: $${propertyDetails.price.toLocaleString()}
- Key Rooms: ${roomList}
${agentNotes ? `- Agent Notes: ${agentNotes}` : ''}

TONE PARAMETERS:
This description should appeal to investors by:
- Contextualizing price relative to market comparables and appreciation trends
- Highlighting rental income potential, occupancy factors, and tenant appeal
- Assessing value-add opportunities and renovation ROI
- Evaluating location fundamentals: employment growth, population trends, zoning
- Analyzing property condition, deferred maintenance, capital expenditure needs
- Considering exit strategy: resale potential, refinance-ability, market liquidity
- Addressing institutional investor criteria: cash-on-cash return, cap rate, cash flow potential
- Presenting facts-based reasoning, not emotional narratives

STRUCTURE:
Organize the description into these sections:
1. Investment Thesis (why this property matters in this market, value proposition summary)
2. Market Context (local market fundamentals, growth drivers, comparable sales trends)
3. Property Positioning (price per square foot, rental market fit, tenant demand)
4. Income Analysis (current or potential rental rates, occupancy, unit/room economics)
5. Physical Condition & Capital Requirements (material condition, systems, deferred maintenance, planned improvements)
6. Value-Add Opportunities (cosmetic improvements, operational efficiencies, rent optimization potential)
7. Risk Assessment & Mitigants (market risks, vacancy risk, regulatory environment, insurance landscape)
8. Exit Potential & Hold Strategy (resale potential, refinance factors, secondary market appeal, appreciation projections)

WRITING GUIDELINES:
- Lead with specific numbers: "At $X per square foot, this property trades at a Y% discount to recent comparable sales in the submarket"
- Use precise terminology: cap rate, cash-on-cash return, occupancy rate, NOI, tenant profile
- Support claims with reasoning: "The XYZ employment corridor expansion is projected to add 5,000 jobs within 2 miles"
- Focus on quantifiable factors: "Walk score of 78; 15-minute radius includes 3 employment hubs"
- Discuss market position analytically: "This unit size (beds/baths) represents 38% of rental demand in this market"
- Address both upside and downside scenarios realistically
- Avoid emotional language entirely—stay analytical and fact-based
- Include specific property metrics investors track: cap rate parameters, management complexity, tenant type appeal
- Avoid: gem, diamond, golden opportunity, can't-miss, once-in-a-lifetime
- Write for experienced investors who understand investment metrics
- Target 900-1150 words`;
}

/**
 * Batch function for generating multiple descriptions
 */
export function generateAllDescriptions(
  input: ListingDescriptionInput
): { luxury: string; casual: string; investment: string } {
  return {
    luxury: generateLuxuryTonePrompt(input),
    casual: generateCasualTonePrompt(input),
    investment: generateInvestmentTonePrompt(input),
  };
}

/**
 * Helper function to format property details for display
 */
export function formatPropertyDetails(details: PropertyDetails): string {
  return `${details.beds}BR/${details.baths}BA • ${details.sqft.toLocaleString()} sqft • ${details.propertyType} • Built ${details.yearBuilt} • $${details.price.toLocaleString()}`;
}
