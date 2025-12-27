export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e8e6e3]">
      <main className="mx-auto w-full max-w-3xl px-6 py-12 md:px-8">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-base text-[#a8a6a3]">
          Last updated: Dec 27, 2025
        </p>

        <section className="mt-10 space-y-4 text-base leading-7 text-[#e8e6e3]">
          <p>
            This Privacy Policy explains how Dolo ("we", "us") collects, uses,
            and shares information when you use the Check In With Friends app
            (the "Service").
          </p>

          <h2 className="mt-10 text-2xl font-semibold">Information we collect</h2>
          <p>
            We collect information you provide directly to us, including:
          </p>
          <ul className="list-disc pl-6 text-[#a8a6a3]">
            <li>Phone number (for account login via SMS verification)</li>
            <li>Display name and optional profile photo</li>
            <li>Check-ins (your 1-10 rating and any optional text or media you share)</li>
            <li>Messages, replies, and reactions you send within groups</li>
          </ul>

          <p>
            We also automatically collect basic usage and device information
            necessary to operate the Service, such as timestamps of activity.
          </p>

          <h2 className="mt-10 text-2xl font-semibold">How we use information</h2>
          <p>We use information to:</p>
          <ul className="list-disc pl-6 text-[#a8a6a3]">
            <li>Provide and maintain the Service (including authentication)</li>
            <li>Deliver SMS notifications you enable (e.g., reminders)</li>
            <li>Enable features like groups, check-ins, replies, and messaging</li>
            <li>Improve reliability, safety, and user experience</li>
          </ul>

          <h2 className="mt-10 text-2xl font-semibold">Sharing of information</h2>
          <p>
            We share information with service providers that help us operate the
            Service, including:
          </p>
          <ul className="list-disc pl-6 text-[#a8a6a3]">
            <li>Supabase (database and authentication)</li>
            <li>Twilio (sending SMS verification codes and notifications)</li>
          </ul>
          <p>
            If AI-generated prompts or features are enabled, we may send limited
            input to an AI provider (such as OpenAI) to generate responses.
            We do not sell your personal information.
          </p>

          <h2 className="mt-10 text-2xl font-semibold">Data retention</h2>
          <p>
            We retain information for as long as needed to provide the Service.
            You may delete your account from within the app, which removes your
            account data according to our deletion process.
          </p>

          <h2 className="mt-10 text-2xl font-semibold">Security</h2>
          <p>
            We take reasonable measures to protect your information, but no
            method of transmission or storage is completely secure.
          </p>

          <h2 className="mt-10 text-2xl font-semibold">Children’s privacy</h2>
          <p>
            The Service is not intended for children under 13. If you believe a
            child has provided us personal information, contact us and we will
            take steps to delete it.
          </p>

          <h2 className="mt-10 text-2xl font-semibold">Contact</h2>
          <p>
            If you have questions about this Privacy Policy, contact us at:
            <span className="text-[#a8a6a3]"> support@checkinwithfriends.app</span>
          </p>
        </section>
      </main>
    </div>
  );
}
