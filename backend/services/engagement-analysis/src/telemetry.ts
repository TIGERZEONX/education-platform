export interface AnalysisTelemetrySnapshot {
  framesAnalyzed: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgModelConfidence: number;
  fpsEstimate: number;
  unstableRate: number;
  insufficientRate: number;
  lastModelVersion: string;
  lastBackendModel: string;
  lastUpdatedAt: string | null;
}

interface Sample {
  latencyMs: number;
  modelConfidence: number;
  signalQuality: "stable" | "unstable" | "insufficient";
  modelVersion: string;
  backendModel: string;
  timestamp: number;
}

const MAX_SAMPLES = 600;

export class AnalysisTelemetryCollector {
  private samples: Sample[] = [];

  record(input: Sample): void {
    this.samples.push(input);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples = this.samples.slice(this.samples.length - MAX_SAMPLES);
    }
  }

  snapshot(now: () => number = () => Date.now()): AnalysisTelemetrySnapshot {
    if (this.samples.length === 0) {
      return {
        framesAnalyzed: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        avgModelConfidence: 0,
        fpsEstimate: 0,
        unstableRate: 0,
        insufficientRate: 0,
        lastModelVersion: "n/a",
        lastBackendModel: "n/a",
        lastUpdatedAt: null,
      };
    }

    const latencies = this.samples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const p95Index = Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95));
    const avgLatencyMs = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
    const avgModelConfidence =
      this.samples.reduce((sum, value) => sum + value.modelConfidence, 0) / this.samples.length;

    const unstableCount = this.samples.filter((s) => s.signalQuality === "unstable").length;
    const insufficientCount = this.samples.filter((s) => s.signalQuality === "insufficient").length;

    const firstTs = this.samples[0].timestamp;
    const lastTs = this.samples[this.samples.length - 1].timestamp;
    const seconds = Math.max(1, (lastTs - firstTs) / 1000);
    const fpsEstimate = this.samples.length / seconds;

    const last = this.samples[this.samples.length - 1];

    return {
      framesAnalyzed: this.samples.length,
      avgLatencyMs: Number(avgLatencyMs.toFixed(2)),
      p95LatencyMs: Number(latencies[p95Index].toFixed(2)),
      avgModelConfidence: Number(avgModelConfidence.toFixed(3)),
      fpsEstimate: Number(fpsEstimate.toFixed(2)),
      unstableRate: Number((unstableCount / this.samples.length).toFixed(3)),
      insufficientRate: Number((insufficientCount / this.samples.length).toFixed(3)),
      lastModelVersion: last.modelVersion,
      lastBackendModel: last.backendModel,
      lastUpdatedAt: new Date(last.timestamp || now()).toISOString(),
    };
  }
}
