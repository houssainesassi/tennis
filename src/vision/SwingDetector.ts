// SwingDetector: consumes the BodyPose stream and emits discrete, debounced
// swing events (FOREHAND / BACKHAND / SERVE). It contains only motion analysis —
// no Three.js, no game rules. The game consumes its events, never raw landmarks.
//
// Detection uses wrist velocity + direction + arm geometry, with thresholds,
// a cooldown, and confidence gating so small wrist jitter never fires a hit.

import type { BodyPose, Landmark } from './types';

export type SwingType = 'FOREHAND' | 'BACKHAND' | 'SERVE';

export interface SwingEvent {
    type: SwingType;
    /** Peak wrist speed (normalized units / second). */
    speed: number;
    /** Normalized swing/throw velocity in pose space (+x = player's right, +y = down). */
    dirX: number;
    dirY: number;
    /** Which hand produced the swing. */
    hand: 'left' | 'right';
    /** Normalized wrist position at release (pose space), for spawning the ball. */
    wristX: number;
    wristY: number;
    /** 'pose' = real body-tracked throw; 'manual' = keyboard fallback. */
    source: 'pose' | 'manual';
    timestamp: number;
}

export interface SwingDetectorOptions {
    /** Minimum wrist speed (norm units/s) to consider a swing. */
    speedThreshold?: number;
    /** Minimum ms between two accepted swings (debounce). */
    cooldownMs?: number;
    /** Minimum landmark visibility for wrist/elbow/shoulder to trust a swing. */
    minVisibility?: number;
    /** Window (ms) over which wrist velocity is measured. */
    velocityWindowMs?: number;
    /** Player's dominant hand (affects forehand/backhand sign). */
    dominant?: 'right' | 'left';
}

const DEFAULTS: Required<SwingDetectorOptions> = {
    speedThreshold: 1.5,
    cooldownMs: 650,
    minVisibility: 0.5,
    velocityWindowMs: 120,
    dominant: 'right',
};

interface Sample {
    t: number;
    x: number;
    y: number;
}

export type SwingCallback = (e: SwingEvent) => void;

export class SwingDetector {
    private opts: Required<SwingDetectorOptions>;
    private historyL: Sample[] = [];
    private historyR: Sample[] = [];
    private lastSwingTs = 0;
    private callbacks = new Set<SwingCallback>();

    constructor(options: SwingDetectorOptions = {}) {
        this.opts = { ...DEFAULTS, ...options };
    }

    onSwing(cb: SwingCallback): () => void {
        this.callbacks.add(cb);
        return () => this.callbacks.delete(cb);
    }

    reset(): void {
        this.historyL = [];
        this.historyR = [];
        this.lastSwingTs = 0;
    }

    /**
     * Feed one pose. Returns a SwingEvent if a swing was detected this frame,
     * otherwise null. Also notifies onSwing subscribers.
     */
    update(pose: BodyPose): SwingEvent | null {
        const now = pose.timestamp || performance.now();
        this.pushSample(this.historyR, pose.rightWrist, now);
        this.pushSample(this.historyL, pose.leftWrist, now);

        if (now - this.lastSwingTs < this.opts.cooldownMs) return null;

        // Evaluate each hand; take the fastest qualifying swing.
        const right = this.evaluateHand('right', pose, now);
        const left = this.evaluateHand('left', pose, now);
        const best = pickFaster(right, left);
        if (!best) return null;

        this.lastSwingTs = now;
        // Clear histories so the same motion can't retrigger immediately.
        this.historyL = [];
        this.historyR = [];
        this.callbacks.forEach((cb) => cb(best));
        return best;
    }

    // --- internals -----------------------------------------------------------

    private pushSample(hist: Sample[], wrist: Landmark | undefined, now: number): void {
        if (!wrist || wrist.visibility < this.opts.minVisibility) return;
        hist.push({ t: now, x: wrist.x, y: wrist.y });
        // Keep only the recent window (+ a little slack).
        const cutoff = now - this.opts.velocityWindowMs * 2.5;
        while (hist.length && hist[0].t < cutoff) hist.shift();
    }

    private evaluateHand(hand: 'right' | 'left', pose: BodyPose, now: number): SwingEvent | null {
        const hist = hand === 'right' ? this.historyR : this.historyL;
        if (hist.length < 2) return null;

        // Velocity over the configured window.
        const latest = hist[hist.length - 1];
        let ref = hist[0];
        for (let i = hist.length - 1; i >= 0; i--) {
            if (latest.t - hist[i].t >= this.opts.velocityWindowMs) {
                ref = hist[i];
                break;
            }
        }
        const dt = (latest.t - ref.t) / 1000;
        if (dt <= 0) return null;

        const vx = (latest.x - ref.x) / dt;
        const vy = (latest.y - ref.y) / dt;
        const speed = Math.hypot(vx, vy);
        if (speed < this.opts.speedThreshold) return null;

        const wrist = hand === 'right' ? pose.rightWrist : pose.leftWrist;
        const shoulder = hand === 'right' ? pose.rightShoulder : pose.leftShoulder;
        const elbow = hand === 'right' ? pose.rightElbow : pose.leftElbow;
        if (!wrist || !shoulder) return null;

        // Require the arm to be reasonably extended (avoid twitchy micro-motions).
        if (elbow) {
            const armSpan = Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y);
            if (armSpan < 0.12) return null;
        }

        // SERVE: wrist raised above the shoulder (smaller y) with a strong vertical snap.
        const raised = wrist.y < shoulder.y - 0.05;
        const verticalDominant = Math.abs(vy) > Math.abs(vx) * 1.1;
        if (raised && verticalDominant) {
            return { type: 'SERVE', speed, dirX: vx, dirY: vy, hand, wristX: wrist.x, wristY: wrist.y, source: 'pose', timestamp: now };
        }

        // Ground strokes: classify by horizontal direction for the dominant hand.
        // Dominant hand swinging toward the body's off-side = forehand; the reverse
        // = backhand. Sign flips for a left-handed player.
        const dom = this.opts.dominant;
        const isDominantHand = hand === dom;
        const movingRight = vx > 0; // +x is player's right (pose is de-mirrored)
        let type: SwingType;
        if (isDominantHand) {
            // Right-handed forehand swings right->left (vx<0); backhand left->right (vx>0).
            const forehand = dom === 'right' ? !movingRight : movingRight;
            type = forehand ? 'FOREHAND' : 'BACKHAND';
        } else {
            // Non-dominant hand leading a stroke reads as a backhand.
            type = 'BACKHAND';
        }
        return { type, speed, dirX: vx, dirY: vy, hand, wristX: wrist.x, wristY: wrist.y, source: 'pose', timestamp: now };
    }
}

function pickFaster(a: SwingEvent | null, b: SwingEvent | null): SwingEvent | null {
    if (!a) return b;
    if (!b) return a;
    return a.speed >= b.speed ? a : b;
}
