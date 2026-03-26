export interface InProcessBrokerPacket {
  topic: string;
  payload: string;
}

type Subscriber = {
  filter: string;
  handler: (packet: InProcessBrokerPacket) => void;
};

function matchesTopicFilter(filter: string, topic: string): boolean {
  const filterParts = filter.split("/");
  const topicParts = topic.split("/");

  for (let i = 0; i < filterParts.length; i += 1) {
    const f = filterParts[i];
    const t = topicParts[i];

    if (f === "#") {
      return true;
    }

    if (f === "+") {
      if (t === undefined) {
        return false;
      }
      continue;
    }

    if (t === undefined || f !== t) {
      return false;
    }
  }

  return filterParts.length === topicParts.length;
}

export class InProcessMqttBroker {
  private readonly subscribers: Subscriber[] = [];

  subscribe(filter: string, handler: (packet: InProcessBrokerPacket) => void): () => void {
    const subscriber: Subscriber = { filter, handler };
    this.subscribers.push(subscriber);

    return () => {
      const idx = this.subscribers.indexOf(subscriber);
      if (idx >= 0) {
        this.subscribers.splice(idx, 1);
      }
    };
  }

  publish(topic: string, payload: string): void {
    const packet: InProcessBrokerPacket = { topic, payload };

    for (const subscriber of this.subscribers) {
      if (matchesTopicFilter(subscriber.filter, topic)) {
        subscriber.handler(packet);
      }
    }
  }
}

let singleton: InProcessMqttBroker | undefined;

export function getInProcessMqttBroker(): InProcessMqttBroker {
  if (!singleton) {
    singleton = new InProcessMqttBroker();
  }

  return singleton;
}
