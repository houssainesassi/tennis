// PoseTracker: owns the webcam + MediaPipe Pose model and nothing else.
// It produces a stream of normalized BodyPose objects. It knows nothing about
// Three.js, tennis, or React — consumers subscribe via callbacks.

import type { BodyPose, Landmark, PoseTrackerStatus } from './types';
import { POSE_LANDMARK } from './types';

// MediaPipe types are imported lazily inside start() so this module is
// safe to import during SSR (the library touches `document`/WASM on load).
type PoseLandmarker = import('@mediapipe/tasks-vision').PoseLandmarker;

export interface PoseTrackerOptions {
    /** Where the WASM runtime lives (self-hosted under /public). */
    wasmBasePath?: string;
    /** URL of the .task model file. */
    modelAssetPath?: string;
    /** Landmarks below this visibility are dropped as unreliable. */
    minVisibility?: number;
    /** Target detection frequency (Hz). Kept below the render rate on purpose. */
    detectionFps?: number;
}

export type PoseCallback = (pose: BodyPose) => void;
export type StatusCallback = (status: PoseTrackerStatus, detail?: string) => void;

const DEFAULTS: Required<PoseTrackerOptions> = {
    wasmBasePath: '/mediapipe/wasm',
    modelAssetPath: '/mediapipe/models/pose_landmarker_lite.task',
    minVisibility: 0.5,
    detectionFps: 24,
};

export class PoseTracker {
    private opts: Required<PoseTrackerOptions>;
    private video: HTMLVideoElement | null = null;
    private stream: MediaStream | null = null;
    private landmarker: PoseLandmarker | null = null;

    private running = false;
    private rafId: number | null = null;
    private lastDetectTs = 0;
    private lastVideoTime = -1;

    private status: PoseTrackerStatus = 'idle';
    private poseCallbacks = new Set<PoseCallback>();
    private statusCallbacks = new Set<StatusCallback>();

    /** The most recent pose, or null if none yet / player lost. */
    latest: BodyPose | null = null;

    constructor(options: PoseTrackerOptions = {}) {
        this.opts = { ...DEFAULTS, ...options };
    }

    onPose(cb: PoseCallback): () => void {
        this.poseCallbacks.add(cb);
        return () => this.poseCallbacks.delete(cb);
    }

    onStatus(cb: StatusCallback): () => void {
        this.statusCallbacks.add(cb);
        // Emit current status immediately so late subscribers are in sync.
        cb(this.status);
        return () => this.statusCallbacks.delete(cb);
    }

    getStatus(): PoseTrackerStatus {
        return this.status;
    }

    private setStatus(status: PoseTrackerStatus, detail?: string) {
        if (this.status === status) return;
        this.status = status;
        this.statusCallbacks.forEach((cb) => cb(status, detail));
    }

    /**
     * Starts the camera and model. Resolves once detection is running, or
     * throws with a status already set (camera-denied / unavailable / model-error)
     * so the app can degrade gracefully and keep running without the webcam.
     */
    async start(video: HTMLVideoElement): Promise<void> {
        if (this.running) return;
        this.video = video;

        // 1. Camera permission + stream.
        this.setStatus('requesting-camera');
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                this.setStatus('camera-unavailable', 'getUserMedia not supported');
                throw new Error('camera-unavailable');
            }
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: false,
            });
        } catch (err: any) {
            const name = err?.name || '';
            if (name === 'NotAllowedError' || name === 'SecurityError') {
                this.setStatus('camera-denied', String(err?.message || err));
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                this.setStatus('camera-unavailable', 'no camera device');
            } else if (this.status !== 'camera-unavailable') {
                this.setStatus('camera-unavailable', String(err?.message || err));
            }
            throw err;
        }

        video.srcObject = this.stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => {
            /* autoplay may be deferred; loop tolerates a not-yet-playing video */
        });

        // 2. Load the model.
        this.setStatus('loading-model');
        try {
            const vision = await import('@mediapipe/tasks-vision');
            const fileset = await vision.FilesetResolver.forVisionTasks(this.opts.wasmBasePath);
            this.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: this.opts.modelAssetPath, delegate: 'GPU' },
                runningMode: 'VIDEO',
                numPoses: 1,
                minPoseDetectionConfidence: 0.5,
                minPosePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });
        } catch (err: any) {
            this.setStatus('model-error', String(err?.message || err));
            throw err;
        }

        this.running = true;
        this.setStatus('no-player');
        this.loop();
    }

    private loop = () => {
        if (!this.running) return;
        this.rafId = requestAnimationFrame(this.loop);

        const now = performance.now();
        const minInterval = 1000 / this.opts.detectionFps;
        if (now - this.lastDetectTs < minInterval) return;

        const video = this.video;
        const landmarker = this.landmarker;
        if (!video || !landmarker || video.readyState < 2) return;

        // Skip if the video hasn't advanced (detectForVideo requires a new frame).
        if (video.currentTime === this.lastVideoTime) return;
        this.lastVideoTime = video.currentTime;
        this.lastDetectTs = now;

        let result;
        try {
            result = landmarker.detectForVideo(video, now);
        } catch {
            // A single failed frame is non-fatal; try again next tick.
            return;
        }

        const landmarks = result?.landmarks?.[0];
        if (!landmarks || landmarks.length < 29) {
            this.latest = null;
            this.setStatus('no-player');
            return;
        }

        const pose = this.buildPose(landmarks, now);
        this.latest = pose;
        this.setStatus('tracking');
        this.poseCallbacks.forEach((cb) => cb(pose));
    };

    /**
     * Converts raw MediaPipe landmarks into a de-mirrored BodyPose.
     * The webcam image is mirrored (selfie view), so we swap left/right to make
     * the player's own left/right match, and flip x so screen-right = player-right.
     */
    private buildPose(raw: Array<{ x: number; y: number; z: number; visibility?: number }>, timestamp: number): BodyPose {
        const min = this.opts.minVisibility;
        const pick = (idx: number): Landmark | undefined => {
            const lm = raw[idx];
            if (!lm) return undefined;
            const visibility = lm.visibility ?? 1;
            if (visibility < min) return undefined;
            return { x: 1 - lm.x, y: lm.y, z: lm.z, visibility }; // mirror x for selfie view
        };

        // De-mirror: MediaPipe's LEFT_* is the image-left joint, which for a
        // mirrored selfie is the player's right side. Swap so names match the body.
        const pose: BodyPose = {
            timestamp,
            confidence: 0,
            rightShoulder: pick(POSE_LANDMARK.LEFT_SHOULDER),
            leftShoulder: pick(POSE_LANDMARK.RIGHT_SHOULDER),
            rightElbow: pick(POSE_LANDMARK.LEFT_ELBOW),
            leftElbow: pick(POSE_LANDMARK.RIGHT_ELBOW),
            rightWrist: pick(POSE_LANDMARK.LEFT_WRIST),
            leftWrist: pick(POSE_LANDMARK.RIGHT_WRIST),
            rightHip: pick(POSE_LANDMARK.LEFT_HIP),
            leftHip: pick(POSE_LANDMARK.RIGHT_HIP),
            rightKnee: pick(POSE_LANDMARK.LEFT_KNEE),
            leftKnee: pick(POSE_LANDMARK.RIGHT_KNEE),
            rightAnkle: pick(POSE_LANDMARK.LEFT_ANKLE),
            leftAnkle: pick(POSE_LANDMARK.RIGHT_ANKLE),
            nose: pick(POSE_LANDMARK.NOSE),
        };

        const tracked = [
            pose.leftShoulder, pose.rightShoulder, pose.leftHip, pose.rightHip,
            pose.leftWrist, pose.rightWrist,
        ].filter((l): l is Landmark => !!l);
        pose.confidence = tracked.length
            ? tracked.reduce((s, l) => s + l.visibility, 0) / tracked.length
            : 0;

        return pose;
    }

    /** Stops detection and releases the camera. Safe to call multiple times. */
    stop() {
        this.running = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach((t) => t.stop());
            this.stream = null;
        }
        if (this.video) {
            this.video.srcObject = null;
        }
        this.landmarker?.close();
        this.landmarker = null;
        this.latest = null;
        this.setStatus('idle');
    }
}
