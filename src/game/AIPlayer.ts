// AIPlayer: a computer opponent that defends the -X half. It tracks the ball,
// moves toward the predicted intercept, and returns the ball when reachable.
// Difficulty scales speed, reach, aim error and miss chance so it makes
// occasional realistic mistakes. Pure gameplay logic + its own character.

import * as THREE from 'three';
import { PlayerCharacter } from './PlayerCharacter';
import { TennisPhysics } from './TennisPhysics';
import { COURT } from './courtConfig';

export type Difficulty = 'easy' | 'medium' | 'hard';

interface DiffParams {
    maxSpeed: number;   // world units / s
    reach: number;      // racket reach
    errorZ: number;     // lateral aim error (world units)
    missChance: number; // probability a reachable ball is flubbed
    powerMin: number;
    powerMax: number;
    reactionMs: number; // delay before committing to a moving ball
}

const DIFFICULTY: Record<Difficulty, DiffParams> = {
    easy:   { maxSpeed: 6.0,  reach: 3.0, errorZ: 2.6, missChance: 0.28, powerMin: 0.35, powerMax: 0.6,  reactionMs: 320 },
    medium: { maxSpeed: 9.0,  reach: 3.2, errorZ: 1.3, missChance: 0.12, powerMin: 0.5,  powerMax: 0.78, reactionMs: 200 },
    hard:   { maxSpeed: 12.0, reach: 3.5, errorZ: 0.6, missChance: 0.04, powerMin: 0.65, powerMax: 0.92, reactionMs: 110 },
};

export interface AIPlayerOptions {
    difficulty?: Difficulty;
    /** Deterministic RNG in [0,1). Defaults to Math.random (mistakes vary run to run). */
    rng?: () => number;
}

export class AIPlayer {
    readonly character: PlayerCharacter;
    private params: DiffParams;
    private rng: () => number;

    private lastHitTs = 0;
    private ballSeenTs = 0;
    private targetX: number;
    private targetZ = 0;

    constructor(scene: THREE.Scene, options: AIPlayerOptions = {}) {
        this.params = DIFFICULTY[options.difficulty ?? 'medium'];
        this.rng = options.rng ?? Math.random;
        this.character = new PlayerCharacter('ai', 0xff5a3c);
        this.targetX = COURT.AI_BASELINE_X;
        scene.add(this.character.root);
    }

    setDifficulty(d: Difficulty): void {
        this.params = DIFFICULTY[d];
    }

    reset(): void {
        this.character.setPosition(COURT.AI_BASELINE_X, 0);
        this.targetX = COURT.AI_BASELINE_X;
        this.targetZ = 0;
        this.lastHitTs = 0;
        this.ballSeenTs = 0;
    }

    /**
     * Per-frame movement: predicts the intercept and moves the character toward it.
     * Runs once per rendered frame (movement can't tunnel, so full dt is fine).
     */
    updateMovement(dt: number, physics: TennisPhysics, now = performance.now()): void {
        const ball = physics.ball;
        const c = this.character.root.position;
        const ballApproaching = ball.inPlay && ball.vel.x < 0; // heading toward -X

        if (ballApproaching) {
            if (!this.ballSeenTs) this.ballSeenTs = now;
            // Predict z where the ball reaches the AI's contact line.
            const contactX = COURT.AI_BASELINE_X + 1.5;
            const eta = ball.vel.x !== 0 ? (contactX - ball.pos.x) / ball.vel.x : 0;
            const predZ = eta > 0 ? ball.pos.z + ball.vel.z * eta : ball.pos.z;
            this.targetZ = clamp(predZ, -COURT.HALF_Z, COURT.HALF_Z);
            // Move up to meet a short ball, otherwise hold near the baseline.
            this.targetX = clamp(ball.pos.x < COURT.AI_BASELINE_X + 5 ? ball.pos.x + 1.2 : COURT.AI_BASELINE_X + 1.5,
                COURT.MIN_X, -COURT.NET_APPROACH_X);
        } else {
            this.ballSeenTs = 0;
            this.targetX = COURT.AI_BASELINE_X + 1.5;
            this.targetZ *= 0.9;
        }

        const reacting = !ballApproaching || now - this.ballSeenTs >= this.params.reactionMs;
        if (reacting) {
            const step = this.params.maxSpeed * dt;
            const nx = approach(c.x, this.targetX, step);
            const nz = approach(c.z, this.targetZ, step);
            const vz = (nz - c.z) / Math.max(dt, 1e-3);
            this.character.setPosition(nx, nz);
            this.character.setMotion(vz);
        }
        this.character.update(dt);
    }

    /**
     * Reachability + return, checked once per PHYSICS sub-step so a fast ball is
     * never tunneled past the AI's racket. Returns true if it struck the ball.
     */
    tryReturn(physics: TennisPhysics, now = performance.now()): boolean {
        const ball = physics.ball;
        const c = this.character.root.position;
        const ballApproaching = ball.inPlay && ball.vel.x < 0;
        if (!ball.inPlay || ball.pos.x >= 0 || !ballApproaching) return false;
        if (now - this.lastHitTs <= 400) return false;

        const dist = Math.hypot(ball.pos.x - c.x, ball.pos.z - c.z);
        if (dist <= this.params.reach && ball.pos.y < 4.5 && ball.pos.y > 0.05) {
            this.lastHitTs = now;
            return this.returnBall(physics, ball.pos.z, c.z);
        }
        return false;
    }

    private returnBall(physics: TennisPhysics, ballZ: number, aiZ: number): boolean {
        // Occasional realistic miss: whiff entirely.
        if (this.rng() < this.params.missChance) {
            this.character.playSwing(this.rng() < 0.5 ? 'forehand' : 'backhand');
            return false;
        }
        const power = this.params.powerMin + this.rng() * (this.params.powerMax - this.params.powerMin);
        // Aim back toward the player's court with error; occasional near-miss aim.
        const errored = (this.rng() * 2 - 1) * this.params.errorZ;
        const aim = clamp((-ballZ * 0.3 + errored) / (COURT.HALF_Z), -1.1, 1.1);

        const c = this.character.root.position;
        this.character.playSwing(ballZ >= aiZ ? 'forehand' : 'backhand');
        return physics.tryHit(
            { by: 'ai', playerX: c.x, playerZ: c.z, aim, power, isServe: false },
            this.params.reach,
        );
    }

    dispose(scene: THREE.Scene): void {
        this.character.dispose(scene);
    }
}

function approach(cur: number, target: number, maxStep: number): number {
    const d = target - cur;
    if (Math.abs(d) <= maxStep) return target;
    return cur + Math.sign(d) * maxStep;
}
function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}
