import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const appSerif = localFont({
  src: "../../public/optiromanaroman-normal.otf",
  variable: "--font-app-serif",
  weight: "400",
  style: "normal",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dolo - Check in with your people",
  description: "Daily check-ins with friends. Share how you're feeling and let your people know what's going on.",
  keywords: ["friends", "check-in", "mental health", "social app", "friend groups", "wellness"],
  authors: [{ name: "Dolo" }],
  creator: "Dolo",
  publisher: "Dolo",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://dolo.app",
    siteName: "Dolo",
    title: "Dolo - Check in with your people",
    description: "Daily check-ins with friends. Share how you're feeling and let your people know what's going on.",
    images: [
      {
        url: "https://dolo.app/api/og",
        width: 1200,
        height: 630,
        alt: "Dolo - Check in with your people",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dolo - Check in with your people",
    description: "Daily check-ins with friends. Share how you're feeling and let your people know what's going on.",
    images: ["https://dolo.app/api/og"],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init zr Wr fi Br Gr ci Nr Hr capture Ui calculateEventProperties Kr register register_once register_for_session unregister unregister_for_session Zr getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty Xr Jr createPersonProfile Qr jr ts opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing Vr debug O Yr getPageViewId captureTraceFeedback captureTraceMetric Or".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
              posthog.init('phc_ghF6MvmuA6aECAWTA3oe0ZMHyGv4hXmRclVGCQCi3gH', {
                api_host: 'https://us.i.posthog.com',
                defaults: '2025-11-30',
                person_profiles: 'identified_only',
              })
            `,
          }}
        />
      </head>
      <body
        className={`${appSerif.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
