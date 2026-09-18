import { ImageResponse } from "next/og";

export const alt = "Jam Notes — write fast, think in space";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generated at build time (no request-time APIs). Uses next/og's bundled
// default font — no external font downloads.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#222831",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 22,
              height: 22,
              background: "#FFD369",
              borderRadius: 3,
            }}
          />
          <div
            style={{
              color: "#EEEEEE",
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: -0.5,
            }}
          >
            Jam Notes
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: "#EEEEEE",
              fontSize: 84,
              fontWeight: 700,
              letterSpacing: -2.5,
              lineHeight: 1.05,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex" }}>Write fast.</div>
            <div style={{ display: "flex" }}>Think in space.</div>
          </div>
          <div
            style={{
              marginTop: 28,
              display: "flex",
              color: "#FFD369",
              fontSize: 26,
            }}
          >
            block editor · spatial canvas · publishing
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "#AEB4BD",
            fontSize: 22,
          }}
        >
          <div style={{ display: "flex" }}>tactile notes for people who build</div>
          <div style={{ display: "flex" }}>{"<50 ms keystrokes"}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
