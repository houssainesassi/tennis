// Shared, framework-agnostic types for the computer-vision layer.
// Nothing here imports Three.js or React — the vision layer stays decoupled
// from rendering and UI (see architecture rules, Phase 11).

/** A single normalized body landmark as produced by MediaPipe Pose. */
export interface Landmark {
    /** Normalized [0,1] horizontal position (0 = left edge of the video frame). */
    x: number;
    /** Normalized [0,1] vertical position (0 = top edge of the video frame). */
    y: number;
    /** Relative depth (negative = closer to camera). Roughly metric, model-dependent. */
    z: number;
    /** Landmark confidence in [0,1]. Low values should be treated as unreliable. */
    visibility: number;
}

/**
 * The subset of landmarks the game cares about, already de-mirrored so that
 * "left" / "right" refer to the player's own left/right, not the mirrored image.
 * Any landmark may be undefined if it was below the confidence threshold.
 */
export interface BodyPose {
    /** Monotonic timestamp (ms) of the video frame this pose was computed from. */
    timestamp: number;
    /** Overall detection confidence in [0,1] (mean visibility of tracked joints). */
    confidence: number;
    leftShoulder?: Landmark;
    rightShoulder?: Landmark;
    leftElbow?: Landmark;
    rightElbow?: Landmark;
    leftWrist?: Landmark;
    rightWrist?: Landmark;
    leftHip?: Landmark;
    rightHip?: Landmark;
    leftKnee?: Landmark;
    rightKnee?: Landmark;
    leftAnkle?: Landmark;
    rightAnkle?: Landmark;
    nose?: Landmark;
}

/** Lifecycle / health status of the pose-tracking pipeline, surfaced to the UI. */
export type PoseTrackerStatus =
    | 'idle'
    | 'requesting-camera'
    | 'camera-denied'
    | 'camera-unavailable'
    | 'loading-model'
    | 'model-error'
    | 'no-player'
    | 'tracking';

/** MediaPipe Pose landmark indices for the joints we consume. */
export const POSE_LANDMARK = {
    NOSE: 0,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
    LEFT_KNEE: 25,
    RIGHT_KNEE: 26,
    LEFT_ANKLE: 27,
    RIGHT_ANKLE: 28,
} as const;
