"use client";

import { useRef, useState } from "react";

/**
 * A minimal, dependency-free signature pad: draws on a canvas, exposes the
 * result as a base64 PNG in a hidden form field (`signatureData`) so it
 * travels along with an ordinary form submit — no client-side fetch needed.
 */
export function SignaturePad({ name = "signatureData" }: { name?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [dataUrl, setDataUrl] = useState("");

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1f1b16";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  }

  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setDataUrl(canvasRef.current!.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setDataUrl("");
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={480}
        height={140}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        style={{
          width: "100%",
          maxWidth: 480,
          height: 140,
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          background: "#fff",
          touchAction: "none",
          cursor: "crosshair",
        }}
      />
      <div style={{ marginTop: "0.4rem" }}>
        <button
          type="button"
          onClick={clear}
          style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontSize: "0.85rem", padding: 0 }}
        >
          Clear signature
        </button>
      </div>
      <input type="hidden" name={name} value={dataUrl} readOnly required={!hasDrawn} />
    </div>
  );
}
