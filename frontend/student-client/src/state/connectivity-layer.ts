import type { ConnectionHealth } from "../types/event-model";

export interface ConnectivityPacket {
  topic: string;
  payload: string;
}

export interface ConnectivityState {
  health: ConnectionHealth;
  queuedPackets: number;
}

export class StudentConnectivityLayer {
  private health: ConnectionHealth = "healthy";

  private readonly queue: ConnectivityPacket[] = [];

  private readonly maxQueueSize: number;

  constructor(maxQueueSize = 200) {
    this.maxQueueSize = maxQueueSize;
  }

  state(): ConnectivityState {
    return {
      health: this.health,
      queuedPackets: this.queue.length,
    };
  }

  setHealth(health: ConnectionHealth, deliver: (packet: ConnectivityPacket) => void): void {
    this.health = health;
    if (health === "healthy") {
      while (this.queue.length > 0) {
        const packet = this.queue.shift();
        if (packet) {
          deliver(packet);
        }
      }
    }
  }

  dispatch(packet: ConnectivityPacket, deliver: (packet: ConnectivityPacket) => void): "sent" | "queued" {
    if (this.health === "healthy") {
      deliver(packet);
      return "sent";
    }

    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
    }

    this.queue.push(packet);
    return "queued";
  }
}
