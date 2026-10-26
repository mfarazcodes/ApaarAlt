"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, X } from "lucide-react";
import { useT } from "../portal/I18n";
import { Button, ICON, Notice } from "../portal/ui";

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/** The browser's own QR reader when it has one. Otherwise null, and jsQR is used. */
function nativeDetector(): BarcodeDetectorLike | null {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  return Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
}

async function decodeCanvas(canvas: HTMLCanvasElement, native: BarcodeDetectorLike | null): Promise<string | null> {
  if (native) {
    const hits = await native.detect(canvas).catch(() => []);
    if (hits[0]) return hits[0].rawValue;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { default: jsQR } = await import("jsqr");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height)?.data ?? null;
}

/** Reads a QR from the camera or from an image file. Runs entirely on the device. */
export default function CameraScanner({ onDecode, disabled = false }: { onDecode: (text: string) => void; disabled?: boolean }) {
  const { t } = useT();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setScanning(false);
  }

  useEffect(() => stop, []);

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("cam.noCamera"));
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch {
      setError(t("cam.blocked"));
      return;
    }
    setScanning(true);
    // Wait for the <video> to mount before attaching the stream.
    setTimeout(async () => {
      if (!video.current || !stream.current) return;
      video.current.srcObject = stream.current;
      await video.current.play().catch(() => undefined);
      const native = nativeDetector();
      const canvas = document.createElement("canvas");
      timer.current = setInterval(async () => {
        const v = video.current;
        if (!v || v.videoWidth === 0) return;
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        canvas.getContext("2d")?.drawImage(v, 0, 0);
        const text = await decodeCanvas(canvas, native);
        if (text) {
          stop();
          onDecode(text);
        }
      }, 300);
    }, 0);
  }

  async function fromImage(file?: File) {
    if (!file) return;
    setError("");
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      const text = await decodeCanvas(canvas, nativeDetector());
      if (text) onDecode(text);
      else setError(t("cam.noQr"));
    } catch {
      setError(t("cam.badImage"));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {scanning ? (
          <Button size="sm" onClick={stop}>
            <X width={16} height={16} className={ICON} />
            {t("cam.stop")}
          </Button>
        ) : (
          <Button size="sm" disabled={disabled} onClick={start}>
            <Camera width={16} height={16} className={ICON} />
            {t("cam.scan")}
          </Button>
        )}
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/[0.12] ${disabled ? "pointer-events-none opacity-50" : ""}`}>
          <ImageUp width={16} height={16} className={ICON} />
          {t("cam.image")}
          <input type="file" accept="image/*" className="sr-only" aria-label={t("cam.imageAria")} onChange={(e) => fromImage(e.target.files?.[0])} />
        </label>
      </div>
      {scanning && <video ref={video} muted playsInline className="aspect-video w-full rounded-xl bg-black/60 object-cover" aria-label={t("cam.preview")} />}
      {error && <Notice tone="amber">{error}</Notice>}
    </div>
  );
}
