import React, { useContext, useEffect, useState, useRef } from "react";
import { StudentContext } from "./context";
import { GlassCard, InteractiveButton } from "../../../shared-ui/components/core-components";
import { FaceMesh, Results } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";

function LiveFaceTracker() {
  const context = useContext(StudentContext)!;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let camera: Camera | null = null;
    let faceMesh: FaceMesh | null = null;
    let isMounted = true;
    
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!isMounted) return;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsActive(true);

        faceMesh = new FaceMesh({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        let lastPublish = Date.now();

        faceMesh.onResults((results: Results) => {
          const now = Date.now();
          if (now - lastPublish < 2000) return; // limit emission rate
          
          if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            
            // Nose tip is index 1. Left cheek 234. Right cheek 454.
            const nose = landmarks[1];
            const left = landmarks[234];
            const right = landmarks[454];

            // Normalize nose X relative to face width to calculate YAW (turning head left/right)
            const faceWidth = right.x - left.x;
            const noseRelativeX = (nose.x - left.x) / faceWidth; 
            const yawOffset = Math.abs(0.5 - noseRelativeX) * 2; 
            
            const headOrientationScore = Math.max(0, 1 - yawOffset);
            const gazeFocusScore = headOrientationScore; 
            const attentivenessScore = (headOrientationScore + gazeFocusScore) / 2;

            context.publishVisualObservation({
              facePresent: true,
              headOrientationScore,
              gazeFocusScore,
              attentivenessScore,
              confidence: 0.9,
            });
          } else {
             context.publishVisualObservation({
              facePresent: false,
              headOrientationScore: 0,
              gazeFocusScore: 0,
              attentivenessScore: 0,
              confidence: 0.9,
            });
          }
          lastPublish = now;
        });

        if (videoRef.current) {
          camera = new Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && isMounted) await faceMesh!.send({ image: videoRef.current });
            },
            width: 320,
            height: 240
          });
          camera.start();
        }
      } catch (err) {
        if (isMounted) {
          setErrorMsg("Camera denied or unavailable.");
          setIsActive(false);
        }
      }
    }

    start();

    return () => {
      isMounted = false;
      camera?.stop();
      faceMesh?.close();
    };
  }, [context]);

  return (
    <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "8px", height: "200px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", marginBottom: "1rem", color: isActive ? "var(--accent-green)" : "var(--accent-red)", overflow: "hidden", position: "relative" }}>
      <video ref={videoRef} style={{ position: "absolute", width: "100%", height: "100%", objectFit: "cover", opacity: 0.3 }} playsInline muted />
      <div style={{ zIndex: 2, fontWeight: "bold", background: "rgba(0,0,0,0.5)", padding: "4px 8px", borderRadius: "4px" }}>
        {errorMsg ? errorMsg : isActive ? "AI Active (MediaPipe FaceMesh)" : "Initializing Camera..."}
      </div>
    </div>
  );
}

export default function App() {
  const context = useContext(StudentContext)!;

  return (
    <div className="app-container">
      <header style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1>Student Space</h1>
        <p>Session: {context.topics.classNamespace}</p>
      </header>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
        <GlassCard title="Privacy-First Camera AI">
          <LiveFaceTracker />
          <p style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>{context.camera.state().helpText}</p>
        </GlassCard>

        <GlassCard title="Immediate Feedback">
          <p style={{ marginBottom: "1rem" }}>Tap a button to share your current state with the teacher anonymously.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <InteractiveButton 
               label="I'm Confused" 
               variant="danger" 
               onClick={() => context.publishFeedbackControl("confused")} 
            />
            <InteractiveButton 
               label="Please Repeat" 
               onClick={() => context.publishFeedbackControl("repeat")} 
            />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
