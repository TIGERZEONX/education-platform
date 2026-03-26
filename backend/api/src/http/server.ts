import express from "express";
import { createServer } from "http";
import { Server as SocketIoServer } from "socket.io";
import cors from "cors";
import { MongoClient } from "mongodb";
import { startInProcessLiveBridge } from "../inprocess/live-bridge";
import { parseIncomingPacket, getInProcessMqttBroker } from "../../../services/realtime-messaging/src";
import { MongoDbHistoryStore } from "../../../services/persistence-history/src";

import fs from "fs";
import path from "path";

const LOG_FILE = "C:\\Users\\gautham jai\\Desktop\\cognative-smart-engagement\\student-eng-tracking\\education-platform\\server_debug.log";

function logToFile(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(msg);
}

const PORT = 4000;
const CLASS_ID = "class-101";
const EXPECTED_STUDENTS = ["aarav-sharma", "mia-chen", "noah-patel", "priya-iyer"];
const MONGO_URI = "mongodb+srv://haarishragavender2005_db_user:pgL3GMbiGdYVgntf@cluster0.ffzhptt.mongodb.net/?appName=Cluster0";

async function runServer() {
  logToFile("[server] Starting server... Log will be in server_debug.log");
  logToFile("[server] Connecting to MongoDB...");
  const mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  logToFile("[server] Connected to MongoDB cluster✅");
  
  const db = mongoClient.db("cognitivepulse");
  const historyStore = new MongoDbHistoryStore(db);

  // ── Express setup ─────────────────────────────────────────────────────────────
  const app = express();
  app.use(cors({ origin: "*" }));
  app.use(express.json());

  const httpServer = createServer(app);

  // ── Socket.io setup ───────────────────────────────────────────────────────────
  const io = new SocketIoServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  const broker = getInProcessMqttBroker();

  // ── Live bridge (ingestion + fusion pipeline runs server-side) ────────────────
  const bridge = startInProcessLiveBridge({
    classId: CLASS_ID,
    expectedStudentIds: EXPECTED_STUDENTS,
    cycleIntervalMs: 4000,
    historyStore, // Inject MongoDB store!
  });

  // Subscribe AFTER bridge init — correct topic format: cognitivepulse/class/{classId}/#
  broker.subscribe(`cognitivepulse/class/${CLASS_ID}/#`, (packet) => {
    logToFile(`[server] relay → teachers: ${packet.topic}`);
    io.to("teachers").emit("backend:message", { topic: packet.topic, payload: packet.payload });
  });

  // ── Socket.io connection handling ─────────────────────────────────────────────
  io.on("connection", async (socket) => {
    const { role, classId, studentId } = socket.handshake.query as {
      role?: string;
      classId?: string;
      studentId?: string;
    };

    logToFile(`[server] client connected: role=${role}, classId=${classId}, studentId=${studentId}`);

    if (role === "teacher") {
      socket.join("teachers");
      logToFile(`[server] teacher joined room for class ${classId}`);

      try {
        const recentCycles = await historyStore.getRecentCycles(CLASS_ID, 20);
        socket.emit("backend:history", { cycles: recentCycles });
        logToFile(`[server] sent ${recentCycles.length} history cycles to teacher`);
      } catch (err) {
        logToFile(`[server] history fetch error: ${err}`);
      }
    }

    if (role === "student") {
      socket.join(`students:${studentId}`);
      logToFile(`[server] student joined: ${studentId}`);

      socket.on("student:event", (data: { topic: string; payload: string }) => {
        try {
          const envelope = parseIncomingPacket(data.payload);
          const valueType = (envelope.payload as { valueType?: string }).valueType ?? "unknown";
          logToFile(`[server] student event from ${studentId}: ${data.topic} (${valueType})`);

          broker.publish(data.topic, data.payload);
        } catch (e) {
          logToFile(`[server] parse error: ${e}`);
        }
      });
    }

    socket.on("disconnect", () => {
      logToFile(`[server] client disconnected: ${role}/${studentId ?? "teacher"}`);
    });
  });

  // ── REST API ──────────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", classId: CLASS_ID, db: "connected", timestamp: new Date().toISOString() });
  });

  app.get("/api/session/:classId/state", async (req, res) => {
    const { classId } = req.params;
    try {
      const recent = await historyStore.getRecentCycles(classId, 1);
      const latest = recent[0] ?? null;
      res.json({ classId, latest, timestamp: new Date().toISOString() });
    } catch (e) {
      res.status(500).json({ error: "DB read failed" });
    }
  });

  app.get("/api/session/:classId/history", async (req, res) => {
    const { classId } = req.params;
    const limit = Number(req.query["limit"] ?? 20);
    try {
      const cycles = await historyStore.getRecentCycles(classId, limit);
      const interventions = await historyStore.getRecentInterventions(classId, 10);
      res.json({ classId, cycles, interventions });
    } catch (e) {
      res.status(500).json({ error: "DB read failed" });
    }
  });

  // ── Start ─────────────────────────────────────────────────────────────────────
  httpServer.listen(PORT, "0.0.0.0", () => {
    logToFile(`[CognitivePulse server] listening on http://0.0.0.0:${PORT}`);
    logToFile(`[CognitivePulse server] class: ${CLASS_ID}`);
    logToFile(`[CognitivePulse server] expected students: ${EXPECTED_STUDENTS.join(", ")}`);
  });
}

runServer().catch((err) => {
  logToFile(`[server] FAIL: ${err}`);
  process.exit(1);
});
