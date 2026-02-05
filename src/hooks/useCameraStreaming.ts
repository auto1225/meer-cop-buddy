import { useState, useRef, useCallback, useEffect } from "react";
import { supabaseShared } from "@/lib/supabase";

interface UseCameraStreamingOptions {
  deviceId?: string;
  intervalMs?: number;
}

export function useCameraStreaming({ deviceId, intervalMs = 1000 }: UseCameraStreamingOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastUploadTime, setLastUploadTime] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Upload snapshot to Supabase Storage
  const uploadSnapshot = useCallback(async (blob: Blob) => {
    if (!deviceId) return null;

    const fileName = `${deviceId}/${Date.now()}.jpg`;
    
    try {
      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabaseShared.storage
        .from("camera-snapshots")
        .upload(fileName, blob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        console.error("[CameraStreaming] Upload error:", uploadError);
        return null;
      }

      // Get public URL
      const { data: urlData } = supabaseShared.storage
        .from("camera-snapshots")
        .getPublicUrl(fileName);

      const imageUrl = urlData.publicUrl;

      // Insert record to camera_snapshots table
      const { error: insertError } = await supabaseShared
        .from("camera_snapshots")
        .insert({
          device_id: deviceId,
          image_url: imageUrl,
        });

      if (insertError) {
        console.error("[CameraStreaming] Insert error:", insertError);
      }

      setLastUploadTime(new Date());
      return imageUrl;
    } catch (error) {
      console.error("[CameraStreaming] Error:", error);
      return null;
    }
  }, [deviceId]);

  // Capture frame from video element
  const captureFrame = useCallback((): Blob | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context || video.videoWidth === 0 || video.readyState < 2) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    // Convert to blob
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        "image/jpeg",
        0.7 // Quality 70%
      );
    }) as unknown as Blob | null;
  }, []);

  // Start streaming
  const startStreaming = useCallback(async (video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    if (!deviceId) {
      console.warn("[CameraStreaming] No deviceId provided");
      return;
    }

    videoRef.current = video;
    canvasRef.current = canvas;
    setIsStreaming(true);

    // Upload first frame immediately
    const blob = await new Promise<Blob | null>((resolve) => {
      const canvas = canvasRef.current!;
      const context = canvas.getContext("2d");
      if (!context || video.videoWidth === 0) {
        resolve(null);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7);
    });

    if (blob) {
      await uploadSnapshot(blob);
    }

    // Start interval
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      if (!context || video.videoWidth === 0 || video.readyState < 2) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);

      const newBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7);
      });

      if (newBlob) {
        await uploadSnapshot(newBlob);
      }
    }, intervalMs);

    console.log("[CameraStreaming] Started streaming");
  }, [deviceId, intervalMs, uploadSnapshot]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    videoRef.current = null;
    canvasRef.current = null;
    setIsStreaming(false);
    console.log("[CameraStreaming] Stopped streaming");
  }, []);

  // Cleanup old snapshots (keep only last 10)
  const cleanupOldSnapshots = useCallback(async () => {
    if (!deviceId) return;

    try {
      // Get all snapshots for this device
      const { data: snapshots, error } = await supabaseShared
        .from("camera_snapshots")
        .select("id, image_url")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false });

      if (error || !snapshots) return;

      // Keep only the last 10
      if (snapshots.length > 10) {
        const toDelete = snapshots.slice(10);
        
        // Delete from table
        await supabaseShared
          .from("camera_snapshots")
          .delete()
          .in("id", toDelete.map(s => s.id));

        // Delete from storage
        const filePaths = toDelete.map(s => {
          const url = new URL(s.image_url);
          return url.pathname.split("/camera-snapshots/")[1];
        }).filter(Boolean);

        if (filePaths.length > 0) {
          await supabaseShared.storage
            .from("camera-snapshots")
            .remove(filePaths);
        }
      }
    } catch (error) {
      console.error("[CameraStreaming] Cleanup error:", error);
    }
  }, [deviceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Periodic cleanup
  useEffect(() => {
    if (!isStreaming) return;

    const cleanupInterval = setInterval(cleanupOldSnapshots, 30000); // Every 30 seconds
    return () => clearInterval(cleanupInterval);
  }, [isStreaming, cleanupOldSnapshots]);

  return {
    isStreaming,
    lastUploadTime,
    startStreaming,
    stopStreaming,
  };
}
