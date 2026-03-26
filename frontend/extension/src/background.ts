declare const chrome: any;
import { io, Socket } from "socket.io-client";

const SERVER_URL = "http://192.168.68.104:4000";
let socket: Socket | null = null;
let connected = false;
let messageQueue: { event: string; data: any }[] = [];

console.log("[background] Service worker loaded.");

function flushQueue() {
  if (!socket || !connected || messageQueue.length === 0) return;
  console.log(`[background] Flushing ${messageQueue.length} queued messages`);
  while (messageQueue.length > 0) {
    const msg = messageQueue.shift();
    if (msg) socket.emit(msg.event, msg.data);
  }
}

function initSocket(role: string, classId: string, studentId?: string) {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  console.log(`[background] Connecting to ${SERVER_URL} as ${role} for ${classId} (studentId: ${studentId})`);
  socket = io(SERVER_URL, {
    query: { role, classId, studentId },
    transports: ["websocket"],
    reconnection: true,
  });

  socket.on("connect", () => {
    connected = true;
    console.log("[background] Socket connected ✅ ID:", socket?.id);
    // Broadcast to all tabs (or we could target specifically, but broadcasting is safer for single-user extension)
    chrome.tabs.query({}, (tabs: any[]) => {
      tabs.forEach(tab => {
        if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "SOCKET_CONNECTED", payload: { id: socket?.id } }).catch(() => {});
      });
    });
    flushQueue();
  });

  socket.on("disconnect", (reason: string) => {
    connected = false;
    console.log("[background] Socket disconnected ❌ Reason:", reason);
    chrome.tabs.query({}, (tabs: any[]) => {
      tabs.forEach(tab => {
        if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "SOCKET_DISCONNECTED", payload: { reason } }).catch(() => {});
      });
    });
  });

  socket.on("backend:message", (data: any) => {
    chrome.tabs.query({}, (tabs: any[]) => {
      tabs.forEach(tab => {
        if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "BACKEND_MESSAGE", payload: data }).catch(() => {});
      });
    });
  });

  socket.on("backend:history", (data: any) => {
    chrome.tabs.query({}, (tabs: any[]) => {
      tabs.forEach(tab => {
        if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "BACKEND_HISTORY", payload: data }).catch(() => {});
      });
    });
  });
}

chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (response?: any) => void) => {
  switch (message.type) {
    case "INIT_SOCKET":
      initSocket(message.payload.role, message.payload.classId, message.payload.studentId);
      break;
    case "EMIT_EVENT":
      if (socket && connected) {
        socket.emit(message.payload.event, message.payload.data);
      } else {
        console.log(`[background] Socket not connected. Queuing ${message.payload.event}`);
        messageQueue.push(message.payload);
        if (messageQueue.length > 200) messageQueue.shift(); // Prevent runaway queue
      }
      break;
  }
  return true;
});
