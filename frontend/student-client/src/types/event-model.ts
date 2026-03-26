export type StudentClientEventCategory =
  | "session-participation"
  | "camera-state"
  | "engagement-update"
  | "explicit-feedback"
  | "status-change"
  | "reconnection-transition"
  | "session-exit";

export interface StudentClientEvent {
  category: StudentClientEventCategory;
  timestamp: string;
  detail: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export type ConnectionHealth = "healthy" | "unstable" | "reconnecting" | "disconnected";

export interface StudentFallbackMode {
  mode: "full-signals" | "camera-fallback" | "reconnect-fallback";
  reason: string;
}
