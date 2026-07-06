"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

/**
 * Root error boundary. Only renders when the root layout/template itself throws,
 * so it REPLACES the layout and must provide its own <html>/<body>. It can't rely
 * on globals.css or the app fonts (the layout that imports them failed), so all
 * styling here is inlined and self-contained. Brand tokens are hardcoded to the
 * dark theme: bg #050505, fg #ededed, muted #888, accent #22c55e.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#050505",
          color: "#ededed",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "1rem",
        }}
      >
        {/* metadata exports aren't supported in global-error; use <title> instead */}
        <title>Something went wrong — Amin Dhouib</title>
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <p
            style={{
              fontSize: "0.875rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#888888",
              margin: "0 0 1rem",
            }}
          >
            Error — Something went wrong
          </p>
          <h1
            style={{
              fontSize: "3.75rem",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              margin: "0 0 1rem",
            }}
          >
            Well, that broke.
          </h1>
          <p
            style={{
              fontSize: "1.0625rem",
              color: "#888888",
              margin: "0 0 2rem",
            }}
          >
            A critical error interrupted the page. Try again, or head back to the homepage.
          </p>
          {error.digest ? (
            <p
              style={{
                fontSize: "0.75rem",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#888888",
                opacity: 0.7,
                margin: "0 0 2rem",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => unstable_retry()}
              style={{
                cursor: "pointer",
                border: "none",
                borderRadius: "0.5rem",
                backgroundColor: "#22c55e",
                color: "#000",
                padding: "0.75rem 1.5rem",
                fontSize: "1rem",
                fontWeight: 600,
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error replaces the crashed root layout; a full document reload (not client-side nav through a broken shell) is the correct recovery */}
            <a
              href="/"
              style={{
                borderRadius: "0.5rem",
                border: "1px solid #1a1a1a",
                color: "#ededed",
                padding: "0.75rem 1.5rem",
                fontSize: "1rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Back to Portfolio
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
