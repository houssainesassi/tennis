// PlayerController: translates body pose (or keyboard fallback) into a smoothed
// world position for the 3D player. It sits between PoseTracker and the Three.js
// character, and contains NO MediaPipe and NO Three.js code — just math.
//
//   Webcam -> PoseTracker -> [PlayerController] -> Three.js Player -> Game logic

import type { BodyPose, Landmark } from '@/vision/types';
import { COURT, clampToHalf, sideSign, type Side, type Vec2 } from './courtConfig';

export interface PlayerControllerOptions {
    side?: Side;
    /** Exponential smoothing time constant (s). Larger = smoother but laggier. */
    smoothingTau?: number;
    /** Shoulder width (normalized) at the near/far ends of the depth range. */
    depthNearWidth?: number;
    depthFarWidth?: number;
    /** Dead-margin on the lateral axis so the player can reach the edges comfortably. */
    lateralDeadMargin?: number;
    /** Invert lateral / depth mapping if the on-screen direction feels reversed. */
    invertLateral?: boolean;
    invertDepth?: boolean;
    /** Manual (keyboard) movement speed, world units / s. */
    manualSpeed?: number;
}

const DEFAULTS: Required<PlayerControllerOptions> = {
    side: 'player',
    smoothingTau: 0.12,
    depthNearWidth: 0.30,
    depthFarWidth: 0.12,
    lateralDeadMargin: 0.15,
    invertLateral: false,
    invertDepth: false,
    manualSpeed: 9.0,
};

export type ControlSource = 'pose' | 'manual' | 'none';

export class PlayerController {
    private opts: Required<PlayerControllerOptions>;

    /** Current smoothed world position (what the 3D character should render at). */
    readonly position: Vec2;
    /** The unsmoothed target the controller is easing toward. */
    private target: Vec2;
    /** Smoothed world-space velocity, useful for lean/anim + AI prediction. */
    readonly velocity: Vec2 = { x: 0, z: 0 };

    private source: ControlSource = 'none';
    private manualAxis: Vec2 = { x: 0, z: 0 };
    private lastPoseTs = 0;

    constructor(options: PlayerControllerOptions = {}) {
        this.opts = { ...DEFAULTS, ...options };
        const sign = sideSign(this.opts.side);
        this.position = { x: COURT.PLAYER_BASELINE_X * (sign > 0 ? 1 : 1), z: 0 };
        // Start each side at its own baseline.
        this.position.x = this.opts.side === 'player' ? COURT.PLAYER_BASELINE_X : COURT.AI_BASELINE_X;
        this.target = { ...this.position };
    }

    getSource(): ControlSource {
        return this.source;
    }

    /** True if a body pose has driven the controller within the last 500ms. */
    isPoseActive(now = performance.now()): boolean {
        return this.source === 'pose' && now - this.lastPoseTs < 500;
    }

    /**
     * Feed a body pose. Computes a lateral target from body-center X and a depth
     * target from shoulder width (a robust monocular distance proxy). Low-confidence
     * poses are ignored so the player holds position instead of snapping.
     */
    updateFromPose(pose: BodyPose): void {
        const cx = this.bodyCenterX(pose);
        const width = this.shoulderWidth(pose);
        if (cx == null && width == null) return;

        const sign = sideSign(this.opts.side);

        // Lateral (Z): body-center X in [margin, 1-margin] -> [-HALF_Z, HALF_Z].
        if (cx != null) {
            const m = this.opts.lateralDeadMargin;
            const t = clamp01((cx - m) / (1 - 2 * m));
            let z = (t - 0.5) * 2 * COURT.HALF_Z;
            if (this.opts.invertLateral) z = -z;
            this.target.z = z;
        }

        // Depth (X): shoulder width -> distance from net. Wider (closer to camera)
        // pushes the player toward the net; narrower retreats to the baseline.
        if (width != null) {
            const { depthNearWidth: near, depthFarWidth: far } = this.opts;
            const t = clamp01((width - far) / (near - far)); // 0 = far, 1 = near
            const forward = this.opts.invertDepth ? 1 - t : t;
            const baseline = COURT.MAX_X * sign;
            const netSide = COURT.NET_APPROACH_X * sign;
            this.target.x = baseline + (netSide - baseline) * forward;
        }

        this.target = clampToHalf(this.target, this.opts.side);
        this.source = 'pose';
        this.lastPoseTs = pose.timestamp || performance.now();
    }

    /** Keyboard/gamepad fallback: dx,dz in [-1,1] (dz = lateral, dx = toward net). */
    setManualAxis(dx: number, dz: number): void {
        this.manualAxis.x = clampSigned(dx);
        this.manualAxis.z = clampSigned(dz);
        if (this.manualAxis.x !== 0 || this.manualAxis.z !== 0) this.source = 'manual';
    }

    /** Directly set a target (used by AIPlayer for its own controller instance). */
    setTarget(x: number, z: number): void {
        this.target = clampToHalf({ x, z }, this.opts.side);
        this.source = 'manual';
    }

    /** Advance the smoothed position toward the target. Call once per frame. */
    update(dt: number): Vec2 {
        // Apply manual input as a velocity nudge on the target.
        if (this.source === 'manual' && (this.manualAxis.x || this.manualAxis.z)) {
            const s = this.opts.manualSpeed * dt;
            const next = {
                x: this.target.x + this.manualAxis.x * s,
                z: this.target.z + this.manualAxis.z * s,
            };
            this.target = clampToHalf(next, this.opts.side);
        }

        // Critically-damped-ish exponential smoothing toward the target.
        const alpha = 1 - Math.exp(-dt / Math.max(1e-3, this.opts.smoothingTau));
        const prevX = this.position.x;
        const prevZ = this.position.z;
        this.position.x += (this.target.x - this.position.x) * alpha;
        this.position.z += (this.target.z - this.position.z) * alpha;

        if (dt > 0) {
            this.velocity.x = (this.position.x - prevX) / dt;
            this.velocity.z = (this.position.z - prevZ) / dt;
        }
        return this.position;
    }

    reset(): void {
        this.position.x = this.opts.side === 'player' ? COURT.PLAYER_BASELINE_X : COURT.AI_BASELINE_X;
        this.position.z = 0;
        this.target = { ...this.position };
        this.velocity.x = 0;
        this.velocity.z = 0;
        this.source = 'none';
        this.manualAxis = { x: 0, z: 0 };
    }

    // --- helpers -------------------------------------------------------------

    private bodyCenterX(pose: BodyPose): number | null {
        const pts = [pose.leftShoulder, pose.rightShoulder, pose.leftHip, pose.rightHip]
            .filter((l): l is Landmark => !!l);
        if (pts.length < 2) return null;
        return pts.reduce((s, l) => s + l.x, 0) / pts.length;
    }

    private shoulderWidth(pose: BodyPose): number | null {
        if (pose.leftShoulder && pose.rightShoulder) {
            return Math.abs(pose.leftShoulder.x - pose.rightShoulder.x);
        }
        if (pose.leftHip && pose.rightHip) {
            // Hips are narrower; scale up so the range roughly matches shoulders.
            return Math.abs(pose.leftHip.x - pose.rightHip.x) * 1.35;
        }
        return null;
    }
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampSigned(v: number): number {
    return v < -1 ? -1 : v > 1 ? 1 : v;
}
