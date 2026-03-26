import type { TrackingMetricsSnapshot } from "./tracking-metrics";
import type { HeadPoseAngles } from "./head-pose-estimator";

export interface DebugOverlayState {
  isVisible: boolean;
  metrics: TrackingMetricsSnapshot | null;
  pose: HeadPoseAngles | null;
  facePresent: boolean;
  confidence: number;
}

export interface DebugOverlay {
  update: (state: DebugOverlayState) => void;
  mount: (container: HTMLElement) => void;
  unmount: () => void;
}

export function createDebugOverlay(): DebugOverlay {
  let overlayElement: HTMLDivElement | null = null;

  const formatMetrics = (metrics: TrackingMetricsSnapshot | null): string => {
    if (!metrics) return "no data";
    const drStr = (metrics.detectionRate * 100).toFixed(0) + "%";
    const cfStr = (metrics.averageConfidence * 100).toFixed(0) + "%";
    const msStr = metrics.longestMissStreak;
    return `det:${drStr} cf:${cfStr} miss:${msStr}`;
  };

  const formatPose = (pose: HeadPoseAngles | null): string => {
    if (!pose) return "---";
    return `p:${pose.pitch}° y:${pose.yaw}° r:${pose.roll}°`;
  };

  return {
    update: (state) => {
      if (!overlayElement) return;

      const statusColor = state.facePresent ? "#4ade80" : "#ef4444";
      const statusText = state.facePresent ? "DETECTED" : "NO FACE";

      overlayElement.innerHTML = `
        <div style="color: ${statusColor}; font-family: monospace; font-size: 11px; line-height: 1.4;">
          <div>[${statusText}] cf=${(state.confidence * 100).toFixed(0)}%</div>
          <div>${formatPose(state.pose)}</div>
          <div>${formatMetrics(state.metrics)}</div>
        </div>
      `;
    },

    mount: (container) => {
      overlayElement = document.createElement("div");
      overlayElement.style.cssText =
        "position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); padding: 6px 8px; border-radius: 4px; z-index: 1000; pointer-events: none;";
      container.appendChild(overlayElement);
    },

    unmount: () => {
      if (overlayElement && overlayElement.parentNode) {
        overlayElement.parentNode.removeChild(overlayElement);
      }
      overlayElement = null;
    },
  };
}
