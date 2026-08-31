'use client';

import type { ScoreSnapshot } from '@/game/GameState';

interface ScoreboardProps {
    score: ScoreSnapshot;
    /** Label for the opponent (e.g. "Computer" or "Player 2"). */
    opponentName?: string;
}

const cell: React.CSSProperties = {
    minWidth: 34,
    textAlign: 'center',
    padding: '2px 8px',
    fontVariantNumeric: 'tabular-nums',
};

export default function Scoreboard({ score, opponentName = 'Computer' }: ScoreboardProps) {
    const Row = ({ name, isServer, point, games, sets, highlight }: {
        name: string; isServer: boolean; point: string; games: number; sets: number; highlight: boolean;
    }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: highlight ? '#fff' : '#cfd6e0' }}>
            <span style={{ width: 10, color: isServer ? '#e8e800' : 'transparent' }}>●</span>
            <span style={{ flex: 1, fontWeight: 600, whiteSpace: 'nowrap' }}>{name}</span>
            <span style={{ ...cell, color: '#9aa4b2' }}>{sets}</span>
            <span style={{ ...cell, color: '#9aa4b2' }}>{games}</span>
            <span style={{ ...cell, fontWeight: 700, color: '#3ad07a', fontSize: 16 }}>{point || '·'}</span>
        </div>
    );

    return (
        <div
            style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1200,
                background: 'rgba(12,16,22,0.82)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '8px 12px',
                fontFamily: 'system-ui, sans-serif',
                fontSize: 13,
                minWidth: 240,
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            }}
        >
            <div style={{ display: 'flex', gap: 4, fontSize: 10, color: '#6b7686', textTransform: 'uppercase', letterSpacing: 0.5, paddingBottom: 4 }}>
                <span style={{ width: 10 }} />
                <span style={{ flex: 1 }}>Player</span>
                <span style={cell}>Set</span>
                <span style={cell}>Gm</span>
                <span style={cell}>Pt</span>
            </div>
            <Row name="You" isServer={score.server === 'player'} point={score.playerPoint} games={score.playerGames} sets={score.playerSets} highlight />
            <Row name={opponentName} isServer={score.server === 'ai'} point={score.aiPoint} games={score.aiGames} sets={score.aiSets} highlight={false} />
            {score.callout && (
                <div style={{ textAlign: 'center', marginTop: 4, color: '#e8e800', fontWeight: 700, fontSize: 12 }}>{score.callout}</div>
            )}
        </div>
    );
}
