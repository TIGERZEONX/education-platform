import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline";
import type {
  EngagementAnalysisRequest,
  EngagementAnalysisResponse,
} from "../../../../shared/communication/mqtt/contracts";

interface WorkerResponse {
  id: string | null;
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class YoloPythonWorker {
  private process: ChildProcessWithoutNullStreams | null = null;

  private readonly pending = new Map<string, PendingRequest>();

  private requestCounter = 0;

  private ready = false;

  private launching = false;

  private ensureLaunched(): void {
    if (this.process || this.launching) {
      return;
    }

    this.launching = true;
    const workerPath = path.resolve(
      process.cwd(),
      "backend/services/engagement-analysis/python/yolo_worker.py",
    );

    const isWin = process.platform === "win32";
    const venvPython = isWin
      ? path.resolve(process.cwd(), "backend/services/engagement-analysis/python/.venv/Scripts/python.exe")
      : path.resolve(process.cwd(), "backend/services/engagement-analysis/python/.venv/bin/python");
    
    let pythonBinary = fs.existsSync(venvPython) ? venvPython : (isWin ? "python" : "python3");

    this.process = spawn(pythonBinary, [workerPath], {
      cwd: process.cwd(),
      env: process.env,
    });

    const rl = readline.createInterface({ input: this.process.stdout });
    rl.on("line", (line) => {
      let parsed: WorkerResponse;
      try {
        parsed = JSON.parse(line) as WorkerResponse;
      } catch {
        return;
      }

      if (!parsed.id) {
        return;
      }

      const pending = this.pending.get(parsed.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      this.pending.delete(parsed.id);

      if (!parsed.ok) {
        pending.reject(new Error(parsed.error ?? "python-worker-error"));
        return;
      }

      pending.resolve(parsed.result);
    });

    this.process.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (message.length > 0) {
        console.warn("[engagement-analysis][python-stderr]", message);
      }
    });

    this.process.on("exit", () => {
      this.ready = false;
      this.launching = false;
      this.process = null;
      for (const [key, request] of this.pending) {
        clearTimeout(request.timeout);
        request.reject(new Error("python-worker-exited"));
        this.pending.delete(key);
      }
    });

    this.launching = false;
  }

  private sendMessage<TResponse>(type: string, payload: unknown, timeoutMs: number): Promise<TResponse> {
    this.ensureLaunched();

    if (!this.process) {
      return Promise.reject(new Error("python-worker-unavailable"));
    }

    this.requestCounter += 1;
    const id = `req-${Date.now()}-${this.requestCounter}`;

    return new Promise<TResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("python-worker-timeout"));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.process!.stdin.write(
        JSON.stringify({ id, type, payload }) + "\n",
      );
    });
  }

  async healthCheck(timeoutMs = 3000): Promise<{ ready: boolean; modelVersion: string; backendModel: string }> {
    const result = await this.sendMessage<{ ready: boolean; modelVersion: string; backendModel: string }>(
      "health",
      {},
      timeoutMs,
    );

    this.ready = result.ready;
    return result;
  }

  async analyze(
    request: EngagementAnalysisRequest,
    timeoutMs = 1500,
  ): Promise<EngagementAnalysisResponse> {
    const result = await this.sendMessage<EngagementAnalysisResponse>("analyze", request, timeoutMs);
    this.ready = true;
    return result;
  }

  isReady(): boolean {
    return this.ready;
  }
}
