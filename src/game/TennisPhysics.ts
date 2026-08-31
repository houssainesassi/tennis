// TennisPhysics: deterministic ball simulation for the existing court.
// Pure math (no Three.js, no randomness) so behavior is understandable and testable.
// The renderer syncs a mesh to `ball.pos`; the game state consumes the returned events.

import { COURT, type Side, sideSign } from './courtConfig';

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface BallState {
    pos: Vec3;
    vel: Vec3;
    /** True while the ball is live in a rally. */
    inPlay: boolean;
    /** Which side last struck the ball (null before serve). */
    lastHitBy: Side | null;
    /** Floor bounces since the last strike (2 = point lost by receiver). */
    bouncesSinceHit: number;
}

/** Events the simulation emits for the game-state layer to score on. */
export type PhysicsEvent =
    | { type: 'bounce'; side: Side | 'net-strip'; inBounds: boolean; count: number; lastHitBy: Side | null; pos: Vec3 }
    | { type: 'net'; lastHitBy: Side | null; pos: Vec3 }
    | { type: 'out'; lastHitBy: Side | null; pos: Vec3 }
    | { type: 'hit'; by: Side };

export interface HitContext {
    by: Side;
    /** Striker's court position. */
    playerX: number;
    playerZ: number;
    /** Lateral aim intent in [-1,1] (from swing direction); 0 = down the middle. */
    aim: number;
    /** Normalized swing power in [0,1]. */
    power: number;
    isServe: boolean;
}

const IN_X = 13.5; // baseline for "in" calls
const IN_Z = 9.0;  // sideline for "in" calls
const NET_HALF_Z = 11.5;
const AIR_FRICTION = 0.02;
const FLOOR_FRICTION = 0.8;

export class TennisPhysics {
    readonly ball: BallState;

    constructor() {
        this.ball = {
            pos: { x: COURT.PLAYER_BASELINE_X, y: 1, z: 0 },
            vel: { x: 0, y: 0, z: 0 },
            inPlay: false,
            lastHitBy: null,
            bouncesSinceHit: 0,
        };
    }

    /** Position the ball for a serve toss on the given side. */
    prepareServe(side: Side): void {
        const b = this.ball;
        const baseX = side === 'player' ? COURT.PLAYER_BASELINE_X - 0.5 : COURT.AI_BASELINE_X + 0.5;
        b.pos = { x: baseX, y: 1.2, z: 0 };
        b.vel = { x: 0, y: 0, z: 0 };
        b.inPlay = false;
        b.lastHitBy = side;
        b.bouncesSinceHit = 0;
    }

    /** Toss the ball straight up so a SERVE swing can strike it. */
    tossServe(): void {
        this.ball.vel = { x: 0, y: 8, z: 0 };
        this.ball.inPlay = true;
    }

    /**
     * Apply a struck ball. Computes a launch velocity that carries the ball to a
     * target in the opponent's court on a net-clearing arc, scaled by swing power.
     * Returns true if the strike connected (ball was reachable), false = whiff.
     */
    tryHit(ctx: HitContext, reach = 3.0): boolean {
        const b = this.ball;
        // Reachability: ball near the striker horizontally and at a hittable height.
        const dx = b.pos.x - ctx.playerX;
        const dz = b.pos.z - ctx.playerZ;
        const horiz = Math.hypot(dx, dz);
        if (!ctx.isServe) {
            if (horiz > reach) return false;
            if (b.pos.y > 4.5 || b.pos.y < 0.05) return false;
        }

        const from = ctx.by;
        const oppSign = -sideSign(from); // opponent half sign
        // Target: opponent's court, depth scales with power, lateral from aim.
        const depth = 0.45 + 0.4 * clamp01(ctx.power); // fraction toward opponent baseline
        const targetX = oppSign * (IN_X * depth);
        const targetZ = clamp(ctx.aim, -1, 1) * (IN_Z * 0.85);
        const targetY = COURT.BALL_RADIUS;

        // Choose flight time from power (more power = faster, flatter), then, if the
        // arc would clip the net, lengthen the flight (higher, slower arc) while
        // keeping the landing ON target. This avoids the range overshoot you get from
        // just adding vertical velocity, so returns stay in the court.
        const g = COURT.GRAVITY;
        const clearance = COURT.NET_HEIGHT + 0.4;
        let T = 1.1 - 0.5 * clamp01(ctx.power); // seconds
        for (let iter = 0; iter < 8; iter++) {
            b.vel.x = (targetX - b.pos.x) / T;
            b.vel.y = (targetY - b.pos.y + 0.5 * g * T * T) / T;
            // Height at the net crossing (x = 0), if the ball is heading over the net.
            if (Math.sign(b.vel.x) !== Math.sign(b.pos.x) && b.pos.x !== 0) {
                const tNet = -b.pos.x / b.vel.x;
                const yNet = b.pos.y + b.vel.y * tNet - 0.5 * g * tNet * tNet;
                if (yNet < clearance && T < 2.2) {
                    T *= 1.15; // slower, higher arc — still lands at target
                    continue;
                }
            }
            break;
        }
        b.vel.z = (targetZ - b.pos.z) / T;

        b.inPlay = true;
        b.lastHitBy = from;
        b.bouncesSinceHit = 0;
        return true;
    }

    /** Advance the simulation by dt seconds, returning any events that occurred. */
    step(dt: number): PhysicsEvent[] {
        const events: PhysicsEvent[] = [];
        const b = this.ball;
        if (!b.inPlay) return events;

        const prevX = b.pos.x;

        // Integrate (semi-implicit Euler).
        b.vel.y -= COURT.GRAVITY * dt;
        const drag = 1 - AIR_FRICTION * dt;
        b.vel.x *= drag;
        b.vel.z *= drag;
        b.pos.x += b.vel.x * dt;
        b.pos.y += b.vel.y * dt;
        b.pos.z += b.vel.z * dt;

        // Net collision: crossing the x=0 plane below net height, within the posts.
        if (prevX !== 0 && Math.sign(prevX) !== Math.sign(b.pos.x)) {
            if (b.pos.y < COURT.NET_HEIGHT && Math.abs(b.pos.z) < NET_HALF_Z) {
                b.pos.x = 0; // stop at the net
                b.vel.x *= -0.15; // dribble back
                b.vel.y *= 0.3;
                b.inPlay = false;
                events.push({ type: 'net', lastHitBy: b.lastHitBy, pos: { ...b.pos } });
                return events;
            }
        }

        // Floor bounce.
        if (b.pos.y <= COURT.BALL_RADIUS && b.vel.y < 0) {
            b.pos.y = COURT.BALL_RADIUS;
            b.vel.y = -b.vel.y * COURT.BOUNCE_RESTITUTION;
            b.vel.x *= FLOOR_FRICTION;
            b.vel.z *= FLOOR_FRICTION;
            b.bouncesSinceHit += 1;

            const inBounds = Math.abs(b.pos.x) <= IN_X && Math.abs(b.pos.z) <= IN_Z;
            const landedSide: Side = b.pos.x >= 0 ? 'player' : 'ai';
            events.push({ type: 'bounce', side: landedSide, inBounds, count: b.bouncesSinceHit, lastHitBy: b.lastHitBy, pos: { ...b.pos } });

            if (!inBounds || b.bouncesSinceHit >= 2) {
                // Out of bounds on any bounce, or a second bounce anywhere, ends the rally.
                b.inPlay = false;
            }
        }

        // Far out-of-bounds catch (flew past everything without a valid bounce).
        if (Math.abs(b.pos.x) > IN_X + 6 || Math.abs(b.pos.z) > IN_Z + 6) {
            if (b.inPlay) {
                b.inPlay = false;
                events.push({ type: 'out', lastHitBy: b.lastHitBy, pos: { ...b.pos } });
            }
        }

        return events;
    }
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
    return clamp(v, 0, 1);
}
