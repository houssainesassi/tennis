'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PoseTracker } from '@/vision/PoseTracker';
import type { PoseTrackerStatus } from '@/vision/types';
import { GameEngine } from '@/game/GameEngine';
import GameUI from './GameUI';
// @ts-ignore - original vanilla SpaceTennis application, not a TypeScript module
import { MyApp } from '../../../MyApp.js';
// @ts-ignore - original vanilla SpaceTennis application, not a TypeScript module
import { MyContents } from '../../../MyContents.js';

export default function GameCanvas() {
    const mounted = useRef(false);
    const appRef = useRef<any>(null);
    const videoElRef = useRef<HTMLVideoElement | null>(null);

    // The pose tracker is created once; safe in a constructor (no DOM/WASM touched).
    const [tracker] = useState(() => new PoseTracker());
    const [engine, setEngine] = useState<GameEngine | null>(null);
    const [poseStatus, setPoseStatus] = useState<PoseTrackerStatus>('idle');

    // --- Original SpaceTennis scene: mounted exactly as before, untouched. ---
    // Once the scene finishes loading, spin up the GameEngine on top of it.
    useEffect(() => {
        if (mounted.current) return;
        mounted.current = true;

        const app = new MyApp();
        app.init();
        const contents = new MyContents(app);
        contents.init();
        appRef.current = app;

        let cancelled = false;
        const waitForScene = () => {
            if (cancelled) return;
            if (app.sceneloaded === true && app.scene) {
                const gameEngine = new GameEngine({ scene: app.scene, app });
                gameEngine.attachPoseTracker(tracker);
                gameEngine.start();
                setEngine(gameEngine);
                // Expose handles for runtime inspection / debugging (dev tooling).
                (window as any).__game = { engine: gameEngine, app, scene: app.scene, tracker };
                return;
            }
            requestAnimationFrame(waitForScene);
        };
        requestAnimationFrame(waitForScene);

        return () => {
            cancelled = true;
        };
    }, [tracker]);

    // Track pose status for the UI.
    useEffect(() => {
        const off = tracker.onStatus((s) => setPoseStatus(s));
        return () => {
            off();
            tracker.stop();
        };
    }, [tracker]);

    const handleVideoReady = useCallback((video: HTMLVideoElement) => {
        videoElRef.current = video;
    }, []);

    const enableCamera = useCallback(async () => {
        const video = videoElRef.current;
        if (!video) return;
        try {
            await tracker.start(video);
        } catch {
            // Status already reflects the failure; the app stays usable without a camera.
        }
    }, [tracker]);

    return (
        <>
            {/* Original scene mount points (ids referenced by MyApp / styles.css). */}
            <div id="canvas" />
            <div id="camera" />

            <GameUI
                engine={engine}
                tracker={tracker}
                poseStatus={poseStatus}
                onEnableCamera={enableCamera}
                onVideoReady={handleVideoReady}
            />
        </>
    );
}
