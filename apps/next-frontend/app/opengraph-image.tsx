import { ImageResponse } from "next/og";

export const alt = "Jam Notes — write fast, think in space";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generated at build time (no request-time APIs). Keep the social card in the
// same paper-monograph world as the landing surface.
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
           background: "#f3efe6",
           color: "#151310",
           padding: 64,
           border: "12px solid #151310",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 22,
              height: 22,
              background: "#ff3d1c",
            }}
          />
          <div
            style={{
              color: "#151310",
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
              color: "#151310",
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
              color: "#ff3d1c",
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
              color: "#151310",
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
