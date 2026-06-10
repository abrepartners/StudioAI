/**
 * services/classifyRoomService.ts
 *
 * Client wrapper for /api/classify-room (moondream2 room-type + emptiness
 * detection). Called once per photo on upload to set the room label and the
 * staging gate. 768px is plenty for classification and keeps the call fast.
 */

import { resizeForUpload } from "../utils/resizeForUpload";

const CLASSIFY_MAX_EDGE = 768;

export interface RoomClassification {
  location: "interior" | "exterior";
  room: string;
  empty: boolean;
  latencyMs: number;
}

export async function classifyRoom(
  imageBase64: string,
  abortSignal?: AbortSignal,
): Promise<RoomClassification> {
  const shrunk = await resizeForUpload(imageBase64, CLASSIFY_MAX_EDGE);
  const res = await fetch("/api/classify-room", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: shrunk }),
    signal: abortSignal,
  });
  if (!res.ok) throw new Error(`classify-room HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "classify-room failed");
  return {
    location: data.location,
    room: data.room,
    empty: Boolean(data.empty),
    latencyMs: data.latencyMs,
  };
}
