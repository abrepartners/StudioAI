import React from "react";
import { LegalPage, H2 } from "./LegalPage";

/**
 * /privacy — Vellum Privacy Policy. Plain-English SaaS policy covering Google
 * sign-in, uploaded photos, AI processing subprocessors, Stripe billing, and
 * Supabase storage. Provided as the Privacy Policy URL for Google's OAuth
 * consent screen. This is a reasonable template, not legal advice — have
 * counsel review before relying on it.
 */
const PrivacyRoute: React.FC = () => (
  <LegalPage title="Privacy Policy" updated="July 7, 2026">
    <p>
      This Privacy Policy explains how Vellum ("Vellum," "we," "us"), a product
      operated by Avery &amp; Bryant, collects, uses, and protects your
      information when you use our website and AI real estate media tools (the
      "Service"). By using the Service, you agree to this policy.
    </p>

    <H2>Information we collect</H2>
    <p>
      <strong>Account information.</strong> When you sign in with Google, we
      receive your name, email address, and profile image from Google. We do not
      receive or store your Google password.
    </p>
    <p>
      <strong>Content you upload.</strong> Photos and images you upload to be
      staged, enhanced, or edited, along with any details you add (such as room
      type, address, or design direction).
    </p>
    <p>
      <strong>Usage data.</strong> How you use the Service, such as generations
      run, tools used, and basic device and log information.
    </p>
    <p>
      <strong>Billing information.</strong> If you subscribe or buy credits,
      payments are processed by Stripe. We receive limited billing details (such
      as plan, status, and the last four digits of your card). We never receive
      or store full card numbers.
    </p>

    <H2>How we use your information</H2>
    <p>
      To provide the Service (including processing your images with AI to
      produce results), to manage your account and billing, to provide support,
      to keep the Service secure, and to improve our features. We do not sell
      your personal information.
    </p>

    <H2>Service providers</H2>
    <p>
      We share information with vendors who help us run the Service, only as
      needed to perform their work:
    </p>
    <ul className="list-disc pl-6 space-y-1">
      <li>
        <strong>Google</strong>: sign-in and authentication.
      </li>
      <li>
        <strong>Stripe</strong>: payment processing.
      </li>
      <li>
        <strong>Supabase</strong>: database and file storage.
      </li>
      <li>
        <strong>AI processing providers</strong> (such as Replicate and Google)
        to generate staged, enhanced, and edited images from the photos you
        upload.
      </li>
      <li>
        <strong>Vercel</strong>: hosting and delivery.
      </li>
    </ul>

    <H2>Data retention</H2>
    <p>
      We keep your account information and content for as long as your account
      is active or as needed to provide the Service. You can request deletion of
      your account and associated content by emailing us.
    </p>

    <H2>Security</H2>
    <p>
      We use reasonable technical and organizational measures to protect your
      information. No method of transmission or storage is completely secure, so
      we cannot guarantee absolute security.
    </p>

    <H2>Your choices and rights</H2>
    <p>
      You may request access to, correction of, or deletion of your personal
      information by emailing us. You can stop using the Service and revoke
      Vellum's access to your Google account at any time through your Google
      account settings.
    </p>

    <H2>Cookies and local storage</H2>
    <p>
      We use browser local storage and similar technologies to keep you signed
      in and remember your preferences, and basic analytics to understand usage.
    </p>

    <H2>Children</H2>
    <p>
      The Service is intended for business use by adults and is not directed to
      anyone under 18. We do not knowingly collect information from children.
    </p>

    <H2>Changes to this policy</H2>
    <p>
      We may update this policy from time to time. When we do, we will revise
      the "Last updated" date above. Continued use of the Service after changes
      means you accept the updated policy.
    </p>
  </LegalPage>
);

export default PrivacyRoute;
