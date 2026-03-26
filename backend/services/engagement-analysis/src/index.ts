import type {
  EngagementAnalysisRequest,
  EngagementAnalysisResponse,
} from "../../../../shared/communication/mqtt/contracts";
import { YoloPythonWorker } from "./python-worker";
import { AnalysisTelemetryCollector, type AnalysisTelemetrySnapshot } from "./telemetry";

export interface EngagementAnalyzer {
  analyze: (input: EngagementAnalysisRequest) => Promise<EngagementAnalysisResponse>;
  health: () => Promise<{ ready: boolean; mode: "yolo"; detail: string }>;
  telemetry: () => AnalysisTelemetrySnapshot;
}

export function createEngagementAnalyzer(): EngagementAnalyzer {
  const worker = new YoloPythonWorker();
  const telemetry = new AnalysisTelemetryCollector();
  let lastHealthDetail = "python worker not initialized";

  const recordTelemetry = (result: EngagementAnalysisResponse): void => {
    telemetry.record({
      latencyMs: result.analysisLatencyMs ?? 0,
      modelConfidence: result.modelConfidence ?? result.confidence,
      signalQuality: result.signalQuality,
      modelVersion: result.modelVersion,
      backendModel: result.backendModel ?? "unknown",
      timestamp: Date.now(),
    });
  };

  return {
    analyze: async (input) => {
      const output = await worker.analyze(input, 45000);
      lastHealthDetail = `ready (${output.modelVersion})`;
      recordTelemetry(output);
      if (telemetry.snapshot().framesAnalyzed % 40 === 0) {
        const snap = telemetry.snapshot();
        console.info(
          `[engagement-analysis] mode=yolo frames=${snap.framesAnalyzed} avgLatencyMs=${snap.avgLatencyMs} p95LatencyMs=${snap.p95LatencyMs} fps=${snap.fpsEstimate} avgModelConfidence=${snap.avgModelConfidence}`,
        );
      }
      return output;
    },
    health: async () => {
      const state = await worker.healthCheck(45000);
      lastHealthDetail = state.ready
        ? `ready (${state.modelVersion})`
        : "worker reported not-ready";
      return {
        ready: state.ready,
        mode: "yolo",
        detail: lastHealthDetail,
      };
    },
    telemetry: () => telemetry.snapshot(),
  };
}

export function analyzeEngagementObservation(_input: EngagementAnalysisRequest): never {
  throw new Error("analyzeEngagementObservation is removed. Use createEngagementAnalyzer().analyze().");
}
