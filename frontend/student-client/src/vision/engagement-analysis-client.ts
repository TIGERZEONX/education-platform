import type {
  EngagementAnalysisRequest,
  EngagementAnalysisResponse,
} from "../../../../shared/communication/mqtt/contracts";

export interface EngagementAnalysisClientConfig {
  endpoint: string;
  requestTimeoutMs: number;
}

export interface EngagementAnalysisClient {
  analyze: (request: EngagementAnalysisRequest) => Promise<EngagementAnalysisResponse>;
}

export function createEngagementAnalysisClient(
  config: EngagementAnalysisClientConfig,
): EngagementAnalysisClient {
  return {
    analyze: async (request) => {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        controller.abort();
      }, config.requestTimeoutMs);

      try {
        const response = await fetch(config.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Engagement analysis failed with status ${response.status}`);
        }

        return (await response.json()) as EngagementAnalysisResponse;
      } finally {
        clearTimeout(timeoutHandle);
      }
    },
  };
}
