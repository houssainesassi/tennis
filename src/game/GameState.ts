// GameState: real tennis scoring, kept entirely out of the React/UI layer.
// It consumes clean physics events (bounce / net / out / hit) and produces an
// immutable snapshot the UI can render. It never touches Three.js or MediaPipe.

import type { Side } from './courtConfig';
import type { PhysicsEvent } from './TennisPhysics';

export type PointReason = 'winner-in' | 'out' | 'net' | 'double-bounce';

/** Human-readable point label per tennis convention. */
export type PointLabel = '0' | '15' | '30' | '40' | 'Ad' | '';

export interface ScoreSnapshot {
    /** Point label within the current game. */
    playerPoint: PointLabel;
    aiPoint: PointLabel;
    /** "Deuce" / "Advantage Player" / etc., or '' when a plain score. */
    callout: string;
    playerGames: number;
    aiGames: number;
    playerSets: number;
    aiSets: number;
    /** Set-by-set games history (completed sets). */
    setHistory: Array<{ player: number; ai: number }>;
    server: Side;
    rallyActive: boolean;
    matchOver: boolean;
    winner: Side | null;
    /** Free-form last event note, for transient UI feedback. */
    lastPointReason: PointReason | null;
}

export interface GameStateOptions {
    /** Sets required to win the match (best-of). Default 2 (best of 3). */
    setsToWin?: number;
    /** Games to win a set. Default 6 (win by 2). */
    gamesPerSet?: number;
}

const POINT_LABELS: PointLabel[] = ['0', '15', '30', '40'];

export class GameState {
    private setsToWin: number;
    private gamesPerSet: number;

    private pPoints = 0;
    private aPoints = 0;
    private pGames = 0;
    private aGames = 0;
    private pSets = 0;
    private aSets = 0;
    private setHistory: Array<{ player: number; ai: number }> = [];
    private server: Side = 'player';
    private rallyActive = false;
    private matchOver = false;
    private winner: Side | null = null;
    private lastHitBy: Side | null = null;
    private lastReason: PointReason | null = null;

    private listeners = new Set<(s: ScoreSnapshot) => void>();

    constructor(options: GameStateOptions = {}) {
        this.setsToWin = options.setsToWin ?? 2;
        this.gamesPerSet = options.gamesPerSet ?? 6;
    }

    onChange(cb: (s: ScoreSnapshot) => void): () => void {
        this.listeners.add(cb);
        cb(this.snapshot());
        return () => this.listeners.delete(cb);
    }

    getSnapshot(): ScoreSnapshot {
        return this.snapshot();
    }

    /** A new point is being served — arm rally scoring. */
    beginPoint(server: Side = this.server): void {
        if (this.matchOver) return;
        this.server = server;
        this.rallyActive = true;
        this.lastHitBy = null;
    }

    /**
     * Feed a physics event. Applies tennis rules to decide when a point ends and
     * who won it. Safe to call for every event; ignores events between points.
     */
    handlePhysicsEvent(e: PhysicsEvent): void {
        if (this.matchOver) return;

        if (e.type === 'hit') {
            this.lastHitBy = e.by;
            // The serve (first strike of a dead ball) starts the rally.
            if (!this.rallyActive) {
                this.rallyActive = true;
                this.server = e.by;
            }
            return;
        }

        if (!this.rallyActive) return;
        const hitter = e.lastHitBy ?? this.lastHitBy;
        if (!hitter) return;

        if (e.type === 'net') {
            this.awardPoint(other(hitter), 'net');
        } else if (e.type === 'out') {
            this.awardPoint(other(hitter), 'out');
        } else if (e.type === 'bounce') {
            if (e.count >= 2) {
                // Ball bounced twice — the receiver failed to return it.
                this.awardPoint(hitter, 'double-bounce');
            } else if (!e.inBounds) {
                // First bounce landed out — the hitter put it out.
                this.awardPoint(other(hitter), 'out');
            }
            // else: first bounce in-bounds → rally continues.
        }
    }

    private awardPoint(winner: Side, reason: PointReason): void {
        if (!this.rallyActive) return;
        this.rallyActive = false;
        this.lastReason = reason;

        if (winner === 'player') this.pPoints++;
        else this.aPoints++;

        // Game won? Need >= 4 points and a 2-point lead (deuce/advantage).
        const hi = Math.max(this.pPoints, this.aPoints);
        const lead = Math.abs(this.pPoints - this.aPoints);
        if (hi >= 4 && lead >= 2) {
            this.awardGame(winner);
        }
        this.emit();
    }

    private awardGame(winner: Side): void {
        this.pPoints = 0;
        this.aPoints = 0;
        if (winner === 'player') this.pGames++;
        else this.aGames++;
        // Alternate serve each game.
        this.server = other(this.server);

        const hi = Math.max(this.pGames, this.aGames);
        const lead = Math.abs(this.pGames - this.aGames);
        if (hi >= this.gamesPerSet && lead >= 2) {
            this.awardSet(winner);
        }
    }

    private awardSet(winner: Side): void {
        this.setHistory.push({ player: this.pGames, ai: this.aGames });
        this.pGames = 0;
        this.aGames = 0;
        if (winner === 'player') this.pSets++;
        else this.aSets++;
        if (this.pSets >= this.setsToWin || this.aSets >= this.setsToWin) {
            this.matchOver = true;
            this.winner = this.pSets > this.aSets ? 'player' : 'ai';
        }
    }

    reset(): void {
        this.pPoints = this.aPoints = 0;
        this.pGames = this.aGames = 0;
        this.pSets = this.aSets = 0;
        this.setHistory = [];
        this.server = 'player';
        this.rallyActive = false;
        this.matchOver = false;
        this.winner = null;
        this.lastHitBy = null;
        this.lastReason = null;
        this.emit();
    }

    // --- snapshot / labels ---------------------------------------------------

    private snapshot(): ScoreSnapshot {
        const { playerPoint, aiPoint, callout } = this.pointLabels();
        return {
            playerPoint, aiPoint, callout,
            playerGames: this.pGames, aiGames: this.aGames,
            playerSets: this.pSets, aiSets: this.aSets,
            setHistory: this.setHistory.slice(),
            server: this.server,
            rallyActive: this.rallyActive,
            matchOver: this.matchOver,
            winner: this.winner,
            lastPointReason: this.lastReason,
        };
    }

    private pointLabels(): { playerPoint: PointLabel; aiPoint: PointLabel; callout: string } {
        const p = this.pPoints;
        const a = this.aPoints;
        // Deuce / advantage handling once both sides reach 40 (3 points).
        if (p >= 3 && a >= 3) {
            if (p === a) return { playerPoint: '40', aiPoint: '40', callout: 'Deuce' };
            if (p === a + 1) return { playerPoint: 'Ad', aiPoint: '', callout: 'Advantage Player' };
            if (a === p + 1) return { playerPoint: '', aiPoint: 'Ad', callout: 'Advantage Opponent' };
            // Larger gap only occurs transiently before a game is awarded.
        }
        return { playerPoint: POINT_LABELS[Math.min(p, 3)], aiPoint: POINT_LABELS[Math.min(a, 3)], callout: '' };
    }

    private emit(): void {
        const snap = this.snapshot();
        this.listeners.forEach((cb) => cb(snap));
    }
}

function other(s: Side): Side {
    return s === 'player' ? 'ai' : 'player';
}
