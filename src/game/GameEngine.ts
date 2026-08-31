// GameEngine: the orchestration layer that lives on top of the original scene.
// It owns gameplay objects (player character, later: ball, AI, physics, scoring)
// and runs its own fixed update loop, SEPARATE from MyApp's render loop, so
// computer vision / physics never block rendering (Phase 10).
//
// It receives the existing THREE.Scene from MyApp and only ADDS objects to it.

import * as THREE from 'three';
import { PlayerCharacter, type SwingKind } from './PlayerCharacter';
import { PlayerController } from './PlayerController';
import { COURT, type Side } from './courtConfig';
import { TennisPhysics, type PhysicsEvent } from './TennisPhysics';
import { GameState } from './GameState';
import { AIPlayer, type Difficulty } from './AIPlayer';
import { SwingDetector, type SwingEvent, type SwingType } from '@/vision/SwingDetector';
import type { PoseTracker } from '@/vision/PoseTracker';

export type GameMode = 'pvc' | 'pvp';

/** Fixed physics timestep (120 Hz) and a cap on catch-up sub-steps per frame. */
const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 40;

const SWING_KIND: Record<SwingType, SwingKind> = {
    FOREHAND: 'forehand',
    BACKHAND: 'backhand',
    SERVE: 'serve',
};

export interface GameEngineDeps {
    scene: THREE.Scene;
    /** The MyApp instance. We only read/set public fields (scene, activeCamera). */
    app: any;
    /** If true, render through the gameplay broadcast camera instead of the scene cam. */
    useGameCamera?: boolean;
}

export class GameEngine {
    private scene: THREE.Scene;
    private app: any;

    readonly player: PlayerCharacter;
    readonly playerController: PlayerController;
    readonly swingDetector: SwingDetector;
    readonly physics: TennisPhysics;
    readonly ai: AIPlayer;
    readonly gameState: GameState;

    private mode: GameMode = 'pvc';
    /** Second controller for local PvP (drives the -X side character). */
    readonly player2Controller: PlayerController;

    private ballMesh: THREE.Mesh;
    private ballShadow: THREE.Mesh;
    private resetAt = 0; // timestamp to re-serve after a dead ball (0 = none)
    private aiServeAt = 0; // timestamp for the AI to auto-serve (0 = none)
    private physicsAccumulator = 0;
    /** Which side serves the next point. */
    private servingSide: Side = 'player';

    /** Subscribers notified of accepted swings (UI feedback, ball hits). */
    private swingCallbacks = new Set<(e: SwingEvent) => void>();
    /** Subscribers notified of physics events (scoring layer). */
    private physicsCallbacks = new Set<(e: PhysicsEvent) => void>();

    /** Broadcast camera positioned behind the player's baseline. */
    private gameCamera: THREE.PerspectiveCamera;
    private useGameCamera: boolean;
    private lastAspect = 0;

    private running = false;
    private rafId: number | null = null;
    private lastTime = 0;
    private unsubPose: (() => void) | null = null;
    private keydownHandler?: (e: KeyboardEvent) => void;
    private keyupHandler?: (e: KeyboardEvent) => void;
    private keys = new Set<string>();

    constructor({ scene, app, useGameCamera = true }: GameEngineDeps) {
        this.scene = scene;
        this.app = app;
        this.useGameCamera = useGameCamera;

        this.playerController = new PlayerController({ side: 'player' });
        this.player = new PlayerCharacter('player', 0x2b6cff);
        this.scene.add(this.player.root);

        this.swingDetector = new SwingDetector();
        this.player2Controller = new PlayerController({ side: 'ai' });
        this.ai = new AIPlayer(this.scene, { difficulty: 'medium' });
        this.gameState = new GameState();

        // Ball + physics.
        this.physics = new TennisPhysics();
        const ballTex = new THREE.TextureLoader().load('/scenes/SGI_TP2_XML_T04_G11_v01/textures/tennisBall.jpg');
        this.ballMesh = new THREE.Mesh(
            new THREE.SphereGeometry(COURT.BALL_RADIUS, 20, 16),
            new THREE.MeshStandardMaterial({ map: ballTex, color: 0xd4ff3d, roughness: 0.6 }),
        );
        this.ballMesh.castShadow = true;
        this.scene.add(this.ballMesh);
        // Cheap fake contact shadow (a dark disc that tracks the ball on the floor).
        this.ballShadow = new THREE.Mesh(
            new THREE.CircleGeometry(COURT.BALL_RADIUS * 1.4, 16),
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
        );
        this.ballShadow.rotation.x = -Math.PI / 2;
        this.scene.add(this.ballShadow);
        this.physics.prepareServe('player');
        this.syncBall();

        // Broadcast camera: behind the +X baseline, looking down the court toward -X.
        this.gameCamera = new THREE.PerspectiveCamera(55, 1.5, 0.1, 1000);
        this.gameCamera.position.set(COURT.MAX_X + 7, 8, 0);
        this.gameCamera.lookAt(-2, 1.6, 0);

        this.attachKeyboard();
    }

    /** Toggle between the gameplay camera and the original scene camera. */
    setUseGameCamera(on: boolean): void {
        this.useGameCamera = on;
    }

    private updateCamera(): void {
        if (!this.useGameCamera || !this.app) return;
        const pz = this.player.root.position.z;
        // Stable broadcast position with a gentle lateral follow.
        this.gameCamera.position.set(COURT.MAX_X + 7, 8, pz * 0.35);
        this.gameCamera.lookAt(-2, 1.6, pz * 0.2);

        const aspect = window.innerWidth / Math.max(1, window.innerHeight);
        if (Math.abs(aspect - this.lastAspect) > 1e-3) {
            this.gameCamera.aspect = aspect;
            this.gameCamera.updateProjectionMatrix();
            this.lastAspect = aspect;
        }
        // MyApp.render() draws with whatever app.activeCamera references.
        this.app.activeCamera = this.gameCamera;
    }

    /** Route pose results into movement (controller) and swing detection. */
    attachPoseTracker(tracker: PoseTracker): void {
        this.unsubPose?.();
        this.unsubPose = tracker.onPose((pose) => {
            if (pose.confidence >= 0.4) this.playerController.updateFromPose(pose);
            const swing = this.swingDetector.update(pose);
            if (swing) this.handleSwing(swing);
        });
    }

    /** Subscribe to accepted swing events (UI, ball hits). Returns an unsubscribe. */
    onSwing(cb: (e: SwingEvent) => void): () => void {
        this.swingCallbacks.add(cb);
        return () => this.swingCallbacks.delete(cb);
    }

    /** Subscribe to physics events (bounce/net/out) for scoring. */
    onPhysics(cb: (e: PhysicsEvent) => void): () => void {
        this.physicsCallbacks.add(cb);
        return () => this.physicsCallbacks.delete(cb);
    }

    setMode(mode: GameMode): void {
        this.mode = mode;
        this.reset();
    }

    getMode(): GameMode {
        return this.mode;
    }

    setDifficulty(d: Difficulty): void {
        this.ai.setDifficulty(d);
    }

    /** The human's swing (pose or keyboard) drives the +X player. */
    private handleSwing(e: SwingEvent): void {
        this.strike('player', this.player, e);
        this.swingCallbacks.forEach((cb) => cb(e));
    }

    /**
     * Side-generic strike: serve if the ball is dead and this side is serving,
     * otherwise attempt a rally return if the ball is on this side's half.
     */
    private strike(side: Side, character: PlayerCharacter, e: SwingEvent): void {
        character.playSwing(SWING_KIND[e.type]);
        const px = character.root.position.x;
        const pz = character.root.position.z;
        const power = clamp((e.speed - 1.0) / 3.0, 0.15, 1);
        const aim = clamp(-e.dirX * 0.25 + pz / COURT.HALF_Z * 0.2, -1, 1);
        const ball = this.physics.ball;
        const sign = side === 'player' ? 1 : -1;

        if (!ball.inPlay) {
            if (this.servingSide !== side) return; // only the server can start the point
            ball.pos.x = px - 0.6 * sign;
            ball.pos.y = 1.6;
            ball.pos.z = pz;
            this.physics.tryHit({ by: side, playerX: px, playerZ: pz, aim, power: Math.max(power, 0.5), isServe: true });
            this.emitPhysics({ type: 'hit', by: side });
        } else if (ball.pos.x * sign > COURT.NET_APPROACH_X * 0.5) {
            const connected = this.physics.tryHit({ by: side, playerX: px, playerZ: pz, aim, power, isServe: false });
            if (connected) this.emitPhysics({ type: 'hit', by: side });
        }
    }

    private emitPhysics(e: PhysicsEvent): void {
        this.gameState.handlePhysicsEvent(e);
        this.physicsCallbacks.forEach((cb) => cb(e));
    }

    private syncBall(): void {
        const p = this.physics.ball.pos;
        this.ballMesh.position.set(p.x, p.y, p.z);
        this.ballShadow.position.set(p.x, COURT.FLOOR_Y + 0.02, p.z);
        const s = clamp(1 - p.y / 12, 0.3, 1);
        this.ballShadow.scale.set(s, s, s);
    }

    /** Manually trigger a player-1 swing (keyboard fallback / tests). */
    triggerSwing(type: SwingType, speed = 2.0): void {
        this.handleSwing({ type, speed, dirX: 0, dirY: 0, hand: 'right', timestamp: performance.now() });
    }

    private synthSwing(type: SwingType): SwingEvent {
        return { type, speed: 2.2, dirX: 0, dirY: 0, hand: 'right', timestamp: performance.now() };
    }

    private attachKeyboard(): void {
        this.keydownHandler = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            this.keys.add(k);
            // Player 1 swing fallback (usable without a webcam).
            if (k === 'j') this.triggerSwing('FOREHAND');
            else if (k === 'k') this.triggerSwing('BACKHAND');
            else if (k === 'l' || k === ' ') this.triggerSwing('SERVE');
            // Player 2 swings (local PvP only).
            else if (this.mode === 'pvp') {
                if (k === 'r') this.strike('ai', this.ai.character, this.synthSwing('FOREHAND'));
                else if (k === 'v') this.strike('ai', this.ai.character, this.synthSwing('BACKHAND'));
                else if (k === 'b') this.strike('ai', this.ai.character, this.synthSwing('SERVE'));
            }
        };
        this.keyupHandler = (e: KeyboardEvent) => {
            this.keys.delete(e.key.toLowerCase());
        };
        window.addEventListener('keydown', this.keydownHandler);
        window.addEventListener('keyup', this.keyupHandler);
    }

    private pollKeyboard(): void {
        // Keyboard is a fallback only when pose isn't driving the controller.
        if (this.playerController.isPoseActive()) return;
        let dx = 0;
        let dz = 0;
        if (this.keys.has('arrowleft') || this.keys.has('a')) dz -= 1;
        if (this.keys.has('arrowright') || this.keys.has('d')) dz += 1;
        if (this.keys.has('arrowup') || this.keys.has('w')) dx -= 1;
        if (this.keys.has('arrowdown') || this.keys.has('s')) dx += 1;
        this.playerController.setManualAxis(dx, dz);
    }

    private pollKeyboardPlayer2(): void {
        // Player 2 movement (local PvP): t/g = toward/away net, f/h = lateral.
        let dx = 0;
        let dz = 0;
        if (this.keys.has('t')) dx += 1;
        if (this.keys.has('g')) dx -= 1;
        if (this.keys.has('f')) dz -= 1;
        if (this.keys.has('h')) dz += 1;
        this.player2Controller.setManualAxis(dx, dz);
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.loop();
    }

    private loop = () => {
        if (!this.running) return;
        this.rafId = requestAnimationFrame(this.loop);
        const now = performance.now();
        let dt = (now - this.lastTime) / 1000;
        this.lastTime = now;
        if (dt > 0.1) dt = 0.1; // clamp long frames (tab switches)
        this.update(dt);
    };

    /** Reset positions, score and re-serve. Called on mode change / new match. */
    reset(): void {
        this.gameState.reset();
        this.servingSide = 'player';
        this.playerController.reset();
        this.player2Controller.reset();
        this.ai.reset();
        this.resetAt = 0;
        this.physics.prepareServe(this.servingSide);
        this.syncBall();
    }

    private update(dt: number): void {
        // Human player (+X side): pose or keyboard.
        this.pollKeyboard();
        const pos = this.playerController.update(dt);
        this.player.setPosition(pos.x, pos.z);
        this.player.setMotion(this.playerController.velocity.z);
        this.player.update(dt);

        // Opponent (-X side): AI movement in PvC, or a second local human in PvP.
        const now = performance.now();
        if (this.mode === 'pvc') {
            this.ai.updateMovement(dt, this.physics, now);
        } else {
            this.pollKeyboardPlayer2();
            const p2 = this.player2Controller.update(dt);
            this.ai.character.setPosition(p2.x, p2.z);
            this.ai.character.setMotion(this.player2Controller.velocity.z);
            this.ai.character.update(dt);
        }

        // Physics: fixed-timestep sub-stepping so the simulation is frame-rate
        // independent (deterministic) and a fast ball can't tunnel through the net
        // or past a racket, even when the render frame rate is low.
        this.physicsAccumulator += dt;
        let guard = 0;
        while (this.physicsAccumulator >= FIXED_DT && guard < MAX_SUBSTEPS) {
            const events = this.physics.step(FIXED_DT);
            for (const ev of events) {
                this.emitPhysics(ev);
                if (ev.type === 'net' || ev.type === 'out') this.scheduleReserve();
                if (ev.type === 'bounce' && !this.physics.ball.inPlay) this.scheduleReserve();
            }
            // Let the AI intercept within the sub-step so fast balls aren't missed.
            if (this.mode === 'pvc' && this.ai.tryReturn(this.physics, now)) {
                this.emitPhysics({ type: 'hit', by: 'ai' });
            }
            this.physicsAccumulator -= FIXED_DT;
            guard += 1;
        }
        if (guard >= MAX_SUBSTEPS) this.physicsAccumulator = 0; // drop backlog after a long stall
        this.syncBall();

        // AI auto-serve when it is the AI's turn to serve (PvC).
        const ball = this.physics.ball;
        if (this.mode === 'pvc' && !ball.inPlay && this.servingSide === 'ai'
            && this.resetAt === 0 && !this.gameState.getSnapshot().matchOver) {
            if (this.aiServeAt === 0) {
                this.aiServeAt = performance.now() + 900;
            } else if (performance.now() >= this.aiServeAt) {
                this.aiServeAt = 0;
                this.strike('ai', this.ai.character, this.synthSwing('SERVE'));
            }
        } else if (ball.inPlay) {
            this.aiServeAt = 0;
        }

        // Auto re-serve after a dead ball; the server alternates per GameState.
        if (this.resetAt && performance.now() >= this.resetAt && !this.gameState.getSnapshot().matchOver) {
            this.resetAt = 0;
            this.servingSide = this.gameState.getSnapshot().server;
            this.ai.reset();
            this.physics.prepareServe(this.servingSide);
            this.syncBall();
        }

        this.updateCamera();
    }

    private scheduleReserve(): void {
        if (!this.resetAt) this.resetAt = performance.now() + 1400;
    }

    stop(): void {
        this.running = false;
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    dispose(): void {
        this.stop();
        this.unsubPose?.();
        if (this.keydownHandler) window.removeEventListener('keydown', this.keydownHandler);
        if (this.keyupHandler) window.removeEventListener('keyup', this.keyupHandler);
        this.player.dispose(this.scene);
        this.ai.dispose(this.scene);
        this.scene.remove(this.ballMesh, this.ballShadow);
    }
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}
