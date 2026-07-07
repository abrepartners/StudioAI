import React from "react";
import { LegalPage, H2 } from "./LegalPage";

/**
 * /terms — Vellum Terms of Service. Covers accounts, acceptable use, image
 * rights, the AI-output / virtual-staging-disclosure disclaimer (important for
 * real estate), billing, and liability. Provided as the Terms of Service URL
 * for Google's OAuth consent screen. Reasonable template, not legal advice —
 * have counsel review.
 */
const TermsRoute: React.FC = () => (
  <LegalPage title="Terms of Service" updated="July 7, 2026">
    <p>
      These Terms of Service ("Terms") govern your use of Vellum ("Vellum,"
      "we," "us"), a product operated by Avery &amp; Bryant, and its website and
      AI real estate media tools (the "Service"). By using the Service, you
      agree to these Terms. If you do not agree, do not use the Service.
    </p>

    <H2>Your account</H2>
    <p>
      You sign in with Google. You are responsible for activity under your
      account and for keeping your login secure. You must be at least 18 and use
      the Service for lawful business purposes.
    </p>

    <H2>Your content and image rights</H2>
    <p>
      You keep ownership of the photos and content you upload. You represent
      that you have the rights to upload and edit them. You grant Vellum a
      limited license to store and process your content solely to provide the
      Service (including sending images to our AI processing providers to
      generate results). You are responsible for the outputs you download and
      how you use them.
    </p>

    <H2>AI output and virtual staging disclosure</H2>
    <p>
      Vellum produces AI-generated and AI-edited images, including virtually
      staged rooms, twilight conversions, sky replacements, and cleanups. These
      images are enhanced or altered and may not depict the actual current
      condition of a property. You are responsible for complying with all
      applicable MLS rules, real estate advertising laws, and disclosure
      requirements, including clearly labeling virtually staged or digitally
      altered images where required.
    </p>

    <H2>Acceptable use</H2>
    <p>You agree not to use the Service to:</p>
    <ul className="list-disc pl-6 space-y-1">
      <li>upload content you do not have the right to use;</li>
      <li>
        create misleading or unlawful images, or misrepresent a property in
        violation of law;
      </li>
      <li>infringe others' intellectual property or privacy rights;</li>
      <li>attempt to disrupt, reverse engineer, or abuse the Service.</li>
    </ul>

    <H2>Billing and subscriptions</H2>
    <p>
      Paid plans and credit purchases are billed through Stripe. Subscriptions
      renew automatically until canceled. You can cancel anytime and your plan
      remains active through the end of the current billing period. Except where
      required by law, payments are non-refundable. Prices and plans may change
      with notice.
    </p>

    <H2>Service availability</H2>
    <p>
      The Service is provided "as is" and "as available." We may modify,
      suspend, or discontinue features at any time. We do not guarantee that AI
      results will meet every expectation or be error-free.
    </p>

    <H2>Disclaimers and limitation of liability</H2>
    <p>
      To the fullest extent permitted by law, Vellum disclaims all warranties,
      express or implied. Vellum will not be liable for indirect, incidental, or
      consequential damages, and our total liability for any claim relating to
      the Service will not exceed the amount you paid us in the twelve months
      before the claim.
    </p>

    <H2>Termination</H2>
    <p>
      You may stop using the Service at any time. We may suspend or terminate
      access if you violate these Terms or use the Service in a way that could
      harm Vellum or others.
    </p>

    <H2>Governing law</H2>
    <p>
      These Terms are governed by the laws of the State of Arkansas, without
      regard to its conflict-of-laws rules.
    </p>

    <H2>Changes to these Terms</H2>
    <p>
      We may update these Terms from time to time. When we do, we will revise
      the "Last updated" date above. Continued use of the Service after changes
      means you accept the updated Terms.
    </p>
  </LegalPage>
);

export default TermsRoute;
