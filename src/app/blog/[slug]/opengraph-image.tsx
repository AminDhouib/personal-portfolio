import { ImageResponse } from "next/og";
import { getBlogPost } from "@/lib/blog";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  const title =
    post?.title ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const tags = post?.tags ?? [];
  const readingTime = post?.readingTime ?? "";

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
        {/* Accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #6366f1, #22c55e, #a78bfa)",
          }}
        />

        {/* Breadcrumb */}
        <div
          style={{
            display: "flex",
            fontSize: 14,
            color: "#888888",
            marginBottom: "24px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          amindhou.com / blog
        </div>

        {/* Title — wraps */}
        <div
          style={{
            display: "flex",
            fontSize: title.length > 50 ? 44 : 56,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            marginBottom: "28px",
            maxWidth: "960px",
          }}
        >
          {title}
        </div>

        {/* Tags + reading time */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          {tags.slice(0, 3).map((tag) => (
            <div
              key={tag}
              style={{
                fontSize: 14,
                color: "#888888",
                border: "1px solid #1a1a1a",
                background: "#0d0d0d",
                padding: "4px 12px",
                borderRadius: "999px",
              }}
            >
              {tag}
            </div>
          ))}
          {readingTime && (
            <div style={{ fontSize: 14, color: "#888888", marginLeft: "8px" }}>
              {readingTime}
            </div>
          )}
        </div>

        {/* Author */}
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
              backgroundColor: "#6366f1",
            }}
          />
          Amin Dhouib
        </div>
      </div>
    ),
    { ...size }
  );
}
