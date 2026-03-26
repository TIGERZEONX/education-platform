import express from "express";
import { createServer } from "http";
import { Server as SocketIoServer } from "socket.io";
import cors from "cors";
import { MongoClient } from "mongodb";
import multer from "multer";
import * as path from "path";
import { startInProcessLiveBridge } from "../inprocess/live-bridge";
import { parseIncomingPacket, getInProcessMqttBroker } from "../../../services/realtime-messaging/src";
import { MongoDbHistoryStore } from "../../../services/persistence-history/src";
import { createEngagementAnalyzer } from "../../../services/engagement-analysis/src";
import type { EngagementAnalysisRequest } from "../../../../shared/communication/mqtt/contracts";

import * as fs from "fs";

// ── Recordings directory ──────────────────────────────────────────────────────
const RECORDINGS_DIR = path.join(__dirname, "..", "..", "recordings");
if (!fs.existsSync(RECORDINGS_DIR)) { fs.mkdirSync(RECORDINGS_DIR, { recursive: true }); }

const recordingStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, RECORDINGS_DIR),
  filename: (_req, file, cb) => {
    const id = `rec_${Date.now()}`;
    cb(null, `${id}${path.extname(file.originalname) || ".webm"}`); 
  },
});
const upload = multer({ storage: recordingStorage, limits: { fileSize: 500 * 1024 * 1024 } });

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
  const engagementAnalyzer = createEngagementAnalyzer();

  // ── Express setup ─────────────────────────────────────────────────────────────
  const app = express();
  app.use(cors({ origin: "*" }));
  app.use(express.json({ limit: "2mb" }));

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

  app.post("/api/analyze-engagement", async (req, res) => {
    const body = req.body as Partial<EngagementAnalysisRequest>;

    if (!body || typeof body.studentId !== "string" || typeof body.classId !== "string") {
      res.status(400).json({ error: "Missing required identifiers in analysis request." });
      return;
    }

    if (
      typeof body.facePresent !== "boolean" ||
      typeof body.confidence !== "number" ||
      typeof body.headOrientationScore !== "number" ||
      typeof body.gazeFocusScore !== "number" ||
      typeof body.attentivenessScore !== "number"
    ) {
      res.status(400).json({ error: "Invalid analysis metrics payload." });
      return;
    }

    try {
      const response = await engagementAnalyzer.analyze({
        studentId: body.studentId,
        classId: body.classId,
        timestamp: body.timestamp ?? new Date().toISOString(),
        facePresent: body.facePresent,
        confidence: body.confidence,
        headOrientationScore: body.headOrientationScore,
        gazeFocusScore: body.gazeFocusScore,
        attentivenessScore: body.attentivenessScore,
        faceWidthRatio: body.faceWidthRatio,
        detectionStability: body.detectionStability,
        faceCropDataUrl: body.faceCropDataUrl,
      });

      res.json(response);
    } catch {
      res.status(500).json({ error: "Engagement analysis failed." });
    }
  });

  app.get("/api/analyze-engagement/health", async (_req, res) => {
    const health = await engagementAnalyzer.health();
    res.json({
      ...health,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/analyze-engagement/telemetry", (_req, res) => {
    res.json({
      ...engagementAnalyzer.telemetry(),
      timestamp: new Date().toISOString(),
    });
  });

  // ── Recording API ─────────────────────────────────────────────────────────────
  const recordingsCollection = db.collection("recordings");

  // Upload a recording (video blob)
  app.post("/api/recordings/upload", upload.single("video"), async (req, res) => {
    const { classId, sessionId, teacherId } = req.body as { classId?: string; sessionId?: string; teacherId?: string };
    if (!req.file || !classId) {
      res.status(400).json({ error: "Missing video file or classId" });
      return;
    }
    const recordingId = path.basename(req.file.filename, path.extname(req.file.filename));
    const doc = {
      recordingId,
      classId,
      sessionId: sessionId ?? `${classId}-live`,
      teacherId: teacherId ?? "teacher",
      filename: req.file.filename,
      fileSize: req.file.size,
      markers: [] as Array<{ id: string; label: string; timestampSec: number; createdAt: string }>,
      createdAt: new Date().toISOString(),
    };
    await recordingsCollection.insertOne(doc);
    logToFile(`[server] Recording saved: ${recordingId}`);
    const { recordingId: _rid, ...rest } = doc as any;
    res.json({ recordingId, fileUrl: `/api/recordings/file/${recordingId}`, ...rest });
  });

  // List recordings for a class
  app.get("/api/recordings/:classId", async (req, res) => {
    const { classId } = req.params;
    const recordings = await recordingsCollection.find({ classId }).sort({ createdAt: -1 }).toArray();
    res.json({ classId, recordings });
  });

  // Serve the actual video file
  app.get("/api/recordings/file/:recordingId", (req, res) => {
    const { recordingId } = req.params;
    const files = fs.readdirSync(RECORDINGS_DIR).filter(f => f.startsWith(recordingId));
    if (files.length === 0) { res.status(404).json({ error: "Recording file not found" }); return; }
    res.sendFile(path.join(RECORDINGS_DIR, files[0]));
  });

  // Add a topic marker to a recording
  app.post("/api/recordings/:recordingId/markers", async (req, res) => {
    const { recordingId } = req.params;
    const { label, timestampSec } = req.body as { label?: string; timestampSec?: number };
    if (!label || timestampSec === undefined) {
      res.status(400).json({ error: "Missing label or timestampSec" });
      return;
    }
    const marker = { id: `m_${Date.now()}`, label, timestampSec, createdAt: new Date().toISOString() };
    await recordingsCollection.updateOne({ recordingId }, { $push: { markers: marker } } as any);
    // broadcast to all students
    io.emit("recording:marker:added", { recordingId, marker });
    res.json({ recordingId, marker });
  });

  // Get markers for a recording
  app.get("/api/recordings/:recordingId/markers", async (req, res) => {
    const { recordingId } = req.params;
    const doc = await recordingsCollection.findOne({ recordingId });
    if (!doc) { res.status(404).json({ error: "Recording not found" }); return; }
    res.json({ recordingId, markers: doc["markers"] ?? [] });
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
