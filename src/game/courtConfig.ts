// Court geometry, derived from the original SpaceTennis scene XML so gameplay
// aligns with the *visible* court. Do not change the scene — change these to match.
//
// From SGI_TP2_XML_T04_G11_v01.xml:
//   - court floor rectangle 30 x 20, centered at origin  -> x∈[-15,15], z∈[-10,10]
//   - net posts at (x=0, z=-12) and (x=0, z=+12)          -> net lies on the X=0 plane
//   - net height ~2.5 (posts) / 2.0 (mesh)
//
// Therefore the baseline-to-baseline axis is X and the sidelines run along Z.

export interface Vec2 {
    /** World X — toward/away from the net (net at x=0). */
    x: number;
    /** World Z — sideline-to-sideline (lateral). */
    z: number;
}

export const COURT = {
    /** Net plane. */
    NET_X: 0,
    /** Effective net height the ball must clear. Slightly under the visual top. */
    NET_HEIGHT: 1.5,
    /** Court surface height (world Y of the floor). */
    FLOOR_Y: 0.0,

    /** Full playable extents (world units). */
    MIN_X: -14.5,
    MAX_X: 14.5,
    /** Sideline half-width (singles-ish, inside the 20-wide floor). */
    HALF_Z: 9.0,

    /** Human player occupies the +X half; AI the -X half. */
    PLAYER_BASELINE_X: 13.0,
    AI_BASELINE_X: -13.0,

    /** How close to the net a player may advance. */
    NET_APPROACH_X: 1.5,

    /** Ball radius (visual + collision). */
    BALL_RADIUS: 0.25,
    /** Gravity magnitude (world units / s^2). Tuned for this court's scale. */
    GRAVITY: 18.0,
    /** Energy retained after a floor bounce (0..1). */
    BOUNCE_RESTITUTION: 0.62,
} as const;

/** Which half of the court a participant defends. */
export type Side = 'player' | 'ai';

/** Sign of the baseline X for a side (+1 for player half, -1 for AI half). */
export function sideSign(side: Side): number {
    return side === 'player' ? 1 : -1;
}

/** Clamp a world position into the given side's playable half. */
export function clampToHalf(pos: Vec2, side: Side): Vec2 {
    const sign = sideSign(side);
    const nearNet = COURT.NET_APPROACH_X * sign;
    const baseline = COURT.MAX_X * sign;
    const loX = Math.min(nearNet, baseline);
    const hiX = Math.max(nearNet, baseline);
    return {
        x: Math.max(loX, Math.min(hiX, pos.x)),
        z: Math.max(-COURT.HALF_Z, Math.min(COURT.HALF_Z, pos.z)),
    };
}
