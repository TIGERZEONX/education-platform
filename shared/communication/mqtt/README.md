# Shared MQTT Messaging Layer

## Scope
Shared real-time contracts and helper boundaries for MQTT over WebSockets.

## Structural Modules
- contracts: payload and envelope contract definitions.
- topics: classroom topic naming conventions and routing keys.
- serializers: canonical encode/decode boundaries for message transport.

## Runtime Safety
- contracts/validation.ts defines runtime schema guards for transport payloads and envelope structures.
- serializers/json-serializer.ts enforces validation during serialization and deserialization.

## Responsibility
Provide a single source of truth for message structure used by student publishers,
teacher subscribers, and backend ingestion or fusion services.
