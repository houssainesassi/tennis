'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameEngine, GameMode } from '@/game/GameEngine';
import type { Difficulty } from '@/game/AIPlayer';
import type { ScoreSnapshot } from '@/game/GameState';
import type { PoseTracker } from '@/vision/PoseTracker';
import type { PoseTrackerStatus } from '@/vision/types';
import Scoreboard from './Scoreboard';
import CameraPreview from './CameraPreview';

type Phase = 'menu' | 'playing' | 'paused' | 'over';

interface GameUIProps {
    engine: GameEngine | null;
    tracker: PoseTracker | null;
    poseStatus: PoseTrackerStatus;
    onEnableCamera: () => void;
    onVideoReady: (v: HTMLVideoElement) => void;
}

const POSE_FEEDBACK: Record<PoseTrackerStatus, string> = {
    idle: 'Camera Off',
    'requesting-camera': 'Requesting Camera…',
    'camera-denied': 'Camera Permission Required',
    'camera-unavailable': 'Camera Unavailable',
    'loading-model': 'Loading Vision Model…',
    'model-error': 'Vision Model Failed',
    'no-player': 'Detecting Player…',
    tracking: 'Player Detected',
};

export default function GameUI({ engine, tracker, poseStatus, onEnableCamera, onVideoReady }: GameUIProps) {
    const [phase, setPhase] = useState<Phase>('menu');
    const [mode, setMode] = useState<GameMode>('pvc');
    const [difficulty, setDifficulty] = useState<Difficulty>('medium');
    const [score, setScore] = useState<ScoreSnapshot | null>(null);
    const [swingToast, setSwingToast] = useState<string | null>(null);
    const toastTimer = useRef<number | null>(null);

    // Camera preview visibility (tracking continues when hidden).
    const [showPreview, setShowPreview] = useState(true);
    // Light Controls (the original lil-gui panel) — HIDDEN by default.
    const [showLights, setShowLights] = useState(false);
    const lilGuiRef = useRef<HTMLElement | null>(null);

    // Locate the original lil-gui panel (created by MyGuiInterface after the scene
    // loads) and hide it by default. We only toggle its CSS display — the panel and
    // all its light controls stay fully functional.
    useEffect(() => {
        if (!engine) return;
        let tries = 0;
        let raf = 0;
        const find = () => {
            const el = (document.querySelector('.lil-gui.root') || document.querySelector('.lil-gui')) as HTMLElement | null;
            if (el) {
                lilGuiRef.current = el;
                el.style.display = showLights ? '' : 'none';
                return;
            }
            if (tries++ < 240) raf = requestAnimationFrame(find);
        };
        raf = requestAnimationFrame(find);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [engine]);

    // Reflect the toggle onto the lil-gui panel's visibility.
    useEffect(() => {
        if (lilGuiRef.current) lilGuiRef.current.style.display = showLights ? '' : 'none';
    }, [showLights]);

    // Subscribe to score + swing events once the engine exists.
    useEffect(() => {
        if (!engine) return;
        const offScore = engine.gameState.onChange((s) => {
            setScore(s);
            if (s.matchOver) setPhase('over');
        });
        const offSwing = engine.onSwing((e) => {
            setSwingToast(`Swing Detected — ${e.type}`);
            if (toastTimer.current) window.clearTimeout(toastTimer.current);
            toastTimer.current = window.setTimeout(() => setSwingToast(null), 850);
        });
        return () => {
            offScore();
            offSwing();
            if (toastTimer.current) window.clearTimeout(toastTimer.current);
        };
    }, [engine]);

    const startMatch = () => {
        if (!engine) return;
        engine.setMode(mode);
        engine.setDifficulty(difficulty);
        engine.reset();
        engine.start();
        setPhase('playing');
    };
    const pause = () => { engine?.stop(); setPhase('paused'); };
    const resume = () => { engine?.start(); setPhase('playing'); };
    const restart = () => { if (!engine) return; engine.reset(); engine.start(); setPhase('playing'); };

    const opponentName = mode === 'pvc' ? 'Computer' : 'Player 2';
    const cameraActive = poseStatus !== 'idle';

    return (
        <>
            {/* Scoreboard (HUD) */}
            {score && phase !== 'menu' && <Scoreboard score={score} opponentName={opponentName} />}

            {/* Status pills — bottom-left, clear of the stats panel + lil-gui. */}
            <div style={pillWrap}>
                <StatusPill color={statusColor(poseStatus)} label={POSE_FEEDBACK[poseStatus]} />
                {phase !== 'menu' && (
                    <StatusPill
                        color="#4a90ff"
                        label={mode === 'pvc' ? `Vs Computer · ${cap(difficulty)}` : 'Player vs Player'}
                    />
                )}
                {phase === 'playing' && tracker && poseStatus === 'idle' && (
                    <StatusPill color="#8892a0" label="Keyboard: ← → move · J/K/L swing" />
                )}
            </div>

            {/* Pause / Restart controls while playing */}
            {phase === 'playing' && (
                // Top-left, clear of the original lil-gui panel on the right edge.
                <button style={{ ...smallBtn, position: 'absolute', top: 54, left: 12, zIndex: 1250 }} onClick={pause}>
                    ‖ Pause
                </button>
            )}

            {/* Swing feedback toast */}
            {swingToast && (
                <div style={toast}>{swingToast}</div>
            )}

            {/* Enable-camera prompt (only before camera active) */}
            {!cameraActive && (
                <button onClick={onEnableCamera} style={{ ...primaryBtn, position: 'absolute', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 1250 }}>
                    Enable Camera
                </button>
            )}

            {/* Webcam preview (always mounted so the <video> exists for the tracker) */}
            <CameraPreview tracker={tracker} status={poseStatus} onVideoReady={onVideoReady} visible={showPreview} />

            {/* Hide/Show camera toggle — small, above the preview. Tracking is unaffected. */}
            {cameraActive && (
                <button
                    onClick={() => setShowPreview((v) => !v)}
                    style={{ ...smallBtn, position: 'absolute', right: 12, bottom: showPreview ? 190 : 12, zIndex: 1250 }}
                >
                    {showPreview ? 'Hide Camera' : 'Show Camera'}
                </button>
            )}

            {/* Light Controls toggle — opens/closes the original lil-gui panel. */}
            <button
                onClick={() => setShowLights((v) => !v)}
                style={{ ...smallBtn, position: 'absolute', top: 12, right: 12, zIndex: 1250 }}
                title="Toggle the scene light controls"
            >
                {showLights ? '✕ Lights' : '⚙ Lights'}
            </button>

            {/* MENU */}
            {phase === 'menu' && (
                <Overlay>
                    <h1 style={{ margin: 0, fontSize: 34, letterSpacing: 1 }}>SPACE TENNIS</h1>
                    <p style={{ marginTop: 4, color: '#9aa4b2' }}>Play tennis with your body — a computer-vision tennis game.</p>

                    <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14, width: 320 }}>
                        <Segmented
                            label="Mode"
                            value={mode}
                            options={[['pvc', 'Vs Computer'], ['pvp', 'Player vs Player']]}
                            onChange={(v) => setMode(v as GameMode)}
                        />
                        {mode === 'pvc' && (
                            <Segmented
                                label="Difficulty"
                                value={difficulty}
                                options={[['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']]}
                                onChange={(v) => setDifficulty(v as Difficulty)}
                            />
                        )}
                        <button style={primaryBtn} onClick={startMatch}>Start Game</button>
                        {!cameraActive && (
                            <button style={ghostBtn} onClick={onEnableCamera}>Enable Camera (optional)</button>
                        )}
                        <div style={{ fontSize: 12, color: '#6b7686', lineHeight: 1.5 }}>
                            {POSE_FEEDBACK[poseStatus]}. Camera optional — you can play with the keyboard
                            (← → move, J forehand, K backhand, L serve).
                        </div>
                    </div>
                </Overlay>
            )}

            {/* PAUSE */}
            {phase === 'paused' && (
                <Overlay>
                    <h2 style={{ margin: 0 }}>Paused</h2>
                    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10, width: 260 }}>
                        <button style={primaryBtn} onClick={resume}>Resume</button>
                        <button style={ghostBtn} onClick={restart}>Restart Match</button>
                        <button style={ghostBtn} onClick={() => setPhase('menu')}>Main Menu</button>
                    </div>
                </Overlay>
            )}

            {/* MATCH OVER */}
            {phase === 'over' && score && (
                <Overlay>
                    <h2 style={{ margin: 0, color: score.winner === 'player' ? '#3ad07a' : '#ff6a5a' }}>
                        {score.winner === 'player' ? 'You Win! 🏆' : `${opponentName} Wins`}
                    </h2>
                    <p style={{ color: '#9aa4b2' }}>
                        Sets {score.playerSets}–{score.aiSets}
                    </p>
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, width: 260 }}>
                        <button style={primaryBtn} onClick={restart}>Rematch</button>
                        <button style={ghostBtn} onClick={() => setPhase('menu')}>Main Menu</button>
                    </div>
                </Overlay>
            )}
        </>
    );
}

// --- small presentational helpers -------------------------------------------

function StatusPill({ color, label }: { color: string; label: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(12,16,22,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '4px 10px', fontSize: 12, color: '#e6eaf0' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
            {label}
        </div>
    );
}

function Overlay({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: 'rgba(6,9,14,0.72)', color: '#fff', fontFamily: 'system-ui, sans-serif', backdropFilter: 'blur(2px)' }}>
            {children}
        </div>
    );
}

function Segmented({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
    return (
        <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8892a0', marginBottom: 6, textAlign: 'left' }}>{label}</div>
            <div style={{ display: 'flex', gap: 6 }}>
                {options.map(([v, lbl]) => (
                    <button key={v} onClick={() => onChange(v)}
                        style={{ flex: 1, padding: '8px 6px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                            border: '1px solid ' + (value === v ? '#3ad07a' : 'rgba(255,255,255,0.15)'),
                            background: value === v ? 'rgba(58,208,122,0.18)' : 'transparent',
                            color: value === v ? '#eafff2' : '#c2cad4' }}>
                        {lbl}
                    </button>
                ))}
            </div>
        </div>
    );
}

function statusColor(s: PoseTrackerStatus): string {
    if (s === 'tracking') return '#3ad07a';
    if (s === 'camera-denied' || s === 'camera-unavailable' || s === 'model-error') return '#e05050';
    if (s === 'idle') return '#8892a0';
    return '#e0b000';
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

const pillWrap: React.CSSProperties = { position: 'absolute', left: 12, bottom: 12, zIndex: 1200, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' };
const primaryBtn: React.CSSProperties = { padding: '11px 18px', borderRadius: 9, border: 'none', background: '#3ad07a', color: '#04331a', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'system-ui, sans-serif' };
const ghostBtn: React.CSSProperties = { padding: '10px 16px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#e6eaf0', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'system-ui, sans-serif' };
const smallBtn: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(12,16,22,0.85)', color: '#e6eaf0', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'system-ui, sans-serif' };
const toast: React.CSSProperties = { position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', zIndex: 1350, background: 'rgba(58,208,122,0.92)', color: '#04331a', fontWeight: 800, fontSize: 15, padding: '8px 18px', borderRadius: 22, fontFamily: 'system-ui, sans-serif', letterSpacing: 0.5, boxShadow: '0 6px 20px rgba(0,0,0,0.4)' };
