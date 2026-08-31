'use client';

import { useEffect, useRef } from 'react';
import type { PoseTracker } from '@/vision/PoseTracker';
import type { BodyPose, Landmark, PoseTrackerStatus } from '@/vision/types';

interface CameraPreviewProps {
    tracker: PoseTracker | null;
    status: PoseTrackerStatus;
    /** Registers the <video> element with the parent so it can start the tracker. */
    onVideoReady: (video: HTMLVideoElement) => void;
    /**
     * Whether the preview box is visually shown. When false the box is hidden but
     * the <video> stays mounted and decoding, so MediaPipe keeps tracking. Defaults true.
     */
    visible?: boolean;
}

const STATUS_LABEL: Record<PoseTrackerStatus, string> = {
    idle: 'Camera Off',
    'requesting-camera': 'Requesting Camera…',
    'camera-denied': 'Camera Permission Required',
    'camera-unavailable': 'Camera Unavailable',
    'loading-model': 'Loading Vision Model…',
    'model-error': 'Vision Model Failed',
    'no-player': 'Detecting Player…',
    tracking: 'Player Detected',
};

const STATUS_COLOR: Record<PoseTrackerStatus, string> = {
    idle: '#888',
    'requesting-camera': '#e0b000',
    'camera-denied': '#e05050',
    'camera-unavailable': '#e05050',
    'loading-model': '#e0b000',
    'model-error': '#e05050',
    'no-player': '#e0b000',
    tracking: '#3ad07a',
};

// Bones to draw for the overlay skeleton (pairs of BodyPose keys).
const BONES: Array<[keyof BodyPose, keyof BodyPose]> = [
    ['leftShoulder', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'],
    ['leftElbow', 'leftWrist'],
    ['rightShoulder', 'rightElbow'],
    ['rightElbow', 'rightWrist'],
    ['leftShoulder', 'leftHip'],
    ['rightShoulder', 'rightHip'],
    ['leftHip', 'rightHip'],
    ['leftHip', 'leftKnee'],
    ['leftKnee', 'leftAnkle'],
    ['rightHip', 'rightKnee'],
    ['rightKnee', 'rightAnkle'],
];

export default function CameraPreview({ tracker, status, onVideoReady, visible = true }: CameraPreviewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (videoRef.current) onVideoReady(videoRef.current);
    }, [onVideoReady]);

    // Draw the skeleton overlay in its own rAF loop, decoupled from React renders.
    useEffect(() => {
        let raf = 0;
        const draw = () => {
            raf = requestAnimationFrame(draw);
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!canvas || !ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const pose = tracker?.latest as BodyPose | null | undefined;
            if (!pose) return;

            const w = canvas.width;
            const h = canvas.height;
            const at = (l?: Landmark) => (l ? { x: l.x * w, y: l.y * h } : null);

            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(58,208,122,0.9)';
            for (const [a, b] of BONES) {
                const pa = at(pose[a] as Landmark | undefined);
                const pb = at(pose[b] as Landmark | undefined);
                if (!pa || !pb) continue;
                ctx.beginPath();
                ctx.moveTo(pa.x, pa.y);
                ctx.lineTo(pb.x, pb.y);
                ctx.stroke();
            }
            ctx.fillStyle = '#fff';
            for (const key of Object.keys(pose) as Array<keyof BodyPose>) {
                const p = at(pose[key] as Landmark | undefined);
                if (!p) continue;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, [tracker]);

    return (
        <div
            style={{
                position: 'absolute',
                right: 12,
                bottom: 12,
                width: 220,
                borderRadius: 8,
                overflow: 'hidden',
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,255,255,0.15)',
                zIndex: 1200,
                fontFamily: 'system-ui, sans-serif',
                // Hidden state: keep the <video> mounted + decoding (MediaPipe keeps
                // working) but make the box invisible and non-interactive.
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? 'auto' : 'none',
            }}
        >
            <div style={{ position: 'relative', width: 220, height: 165, background: '#111' }}>
                <video
                    ref={videoRef}
                    width={220}
                    height={165}
                    // Selfie-mirror the video only; the overlay canvas is drawn in
                    // de-mirrored pose space, which visually aligns with this.
                    style={{ transform: 'scaleX(-1)', width: 220, height: 165, objectFit: 'cover' }}
                    playsInline
                    muted
                />
                <canvas
                    ref={canvasRef}
                    width={220}
                    height={165}
                    style={{ position: 'absolute', left: 0, top: 0, width: 220, height: 165 }}
                />
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 8px',
                    fontSize: 12,
                    color: '#eee',
                }}
            >
                <span
                    style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: STATUS_COLOR[status],
                        flex: 'none',
                    }}
                />
                {STATUS_LABEL[status]}
            </div>
        </div>
    );
}
