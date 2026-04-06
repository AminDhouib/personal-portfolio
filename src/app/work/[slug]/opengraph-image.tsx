import { ImageResponse } from "next/og";
import { projects } from "@/data/projects";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);

  const name = project?.name ?? slug;
  const tagline = project?.tagline ?? "";
  const isOSS = project?.isOSS ?? false;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "60px 80px",
          backgroundColor: "#050505",
          color: "#ededed",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Accent bar top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #22c55e, #6366f1, #a78bfa)",
          }}
        />

        {/* OSS badge */}
        {isOSS && (
          <div
            style={{
              position: "absolute",
              top: "60px",
              right: "80px",
              display: "flex",
              alignItems: "center",
              border: "1px solid rgba(34,197,94,0.4)",
              background: "rgba(34,197,94,0.1)",
              color: "#22c55e",
              fontSize: 14,
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: "999px",
              letterSpacing: "0.1em",
            }}
          >
            OPEN SOURCE
          </div>
        )}

        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            fontSize: 14,
            color: "#888888",
            marginBottom: "16px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          amindhou.com / work
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            fontSize: 80,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 0.9,
            marginBottom: "20px",
          }}
        >
          {name.toUpperCase()}
        </div>

        {/* Tagline */}
        {tagline && (
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: "#888888",
              fontWeight: 400,
            }}
          >
            {tagline}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: "60px",
            right: "80px",
            fontSize: 16,
            color: "#888888",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "#22c55e",
            }}
          />
          Amin Dhouib
        </div>
      </div>
    ),
    { ...size }
  );
}
