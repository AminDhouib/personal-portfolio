import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Amin Dhouib — Engineer, Founder, Builder";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px 80px",
          backgroundColor: "#050505",
          color: "#ededed",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <span
            style={{
              fontSize: 96,
              fontWeight: 900,
              letterSpacing: "-0.05em",
              lineHeight: 0.9,
            }}
          >
            AMIN
          </span>
          <span
            style={{
              fontSize: 96,
              fontWeight: 200,
              letterSpacing: "-0.05em",
              lineHeight: 0.9,
            }}
          >
            DHOUIB
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: "24px",
            marginTop: "32px",
            alignItems: "center",
          }}
        >
          {[
            { label: "Engineer", color: "#22c55e" },
            { label: "Founder", color: "#6366f1" },
            { label: "Builder", color: "#a78bfa" },
          ].map((role) => (
            <div
              key={role.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "2px",
                  backgroundColor: role.color,
                  borderRadius: "999px",
                }}
              />
              <span
                style={{
                  fontSize: 20,
                  color: "#888888",
                  fontWeight: 500,
                }}
              >
                {role.label}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: "60px",
            left: "80px",
            fontSize: 16,
            color: "#888888",
          }}
        >
          amindhou.com
        </div>
      </div>
    ),
    { ...size }
  );
}
