"use client";

// ============================================================
// MeshBackground — latar mesh gradient bergerak sangat pelan.
// 5 blob warna besar dengan blur berat supaya efek kaca terbaca.
// ============================================================

export function MeshBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden"
      style={{ background: "var(--app-bg)" }}
    >
      <div
        className="blob-mesh"
        style={
          {
            width: "55vw",
            height: "55vw",
            top: "-12%",
            left: "-15%",
            background: "var(--mesh-1)",
            "--durasi": "26s",
          } as React.CSSProperties
        }
      />
      <div
        className="blob-mesh blob-mesh-2"
        style={
          {
            width: "48vw",
            height: "48vw",
            top: "8%",
            right: "-18%",
            background: "var(--mesh-2)",
            "--durasi": "24s",
          } as React.CSSProperties
        }
      />
      <div
        className="blob-mesh blob-mesh-3"
        style={
          {
            width: "52vw",
            height: "52vw",
            bottom: "-15%",
            left: "-10%",
            background: "var(--mesh-3)",
            "--durasi": "30s",
          } as React.CSSProperties
        }
      />
      <div
        className="blob-mesh blob-mesh-4"
        style={
          {
            width: "38vw",
            height: "38vw",
            top: "38%",
            right: "-12%",
            background: "var(--mesh-4)",
            "--durasi": "28s",
          } as React.CSSProperties
        }
      />
      <div
        className="blob-mesh blob-mesh-5"
        style={
          {
            width: "42vw",
            height: "42vw",
            bottom: "12%",
            right: "18%",
            background: "var(--mesh-5)",
            "--durasi": "22s",
          } as React.CSSProperties
        }
      />
    </div>
  );
}
