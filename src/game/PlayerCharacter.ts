// PlayerCharacter: a modular Three.js avatar with a racket that visibly reacts to
// movement and swings. It is ADDED to the existing SpaceTennis scene (never replaces
// it). Built from primitives so it needs no external asset and matches the court scale.

import * as THREE from 'three';
import { COURT, type Side, sideSign } from './courtConfig';

export type SwingKind = 'forehand' | 'backhand' | 'serve';

interface SwingAnim {
    kind: SwingKind;
    t: number;       // elapsed seconds
    duration: number;
}

export class PlayerCharacter {
    readonly root: THREE.Group;
    private armPivot: THREE.Group;   // shoulder pivot that swings the racket
    private racket: THREE.Group;
    private side: Side;
    private facingSign: number;      // -1 = facing toward -X (net), for player half

    private swing: SwingAnim | null = null;
    private lean = 0;                // current lateral lean (rad), eased
    private bobPhase = 0;

    constructor(side: Side, color = 0x2b6cff) {
        this.side = side;
        // Player half faces -X (toward net at x=0); AI half faces +X.
        this.facingSign = side === 'player' ? -1 : 1;

        this.root = new THREE.Group();
        this.root.name = `tennisPlayer_${side}`;

        const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.8 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.6 });

        // Torso
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.1, 6, 12), bodyMat);
        torso.position.y = 2.1;
        torso.castShadow = true;
        this.root.add(torso);

        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16), skinMat);
        head.position.y = 3.2;
        head.castShadow = true;
        this.root.add(head);

        // Legs
        const legGeo = new THREE.CapsuleGeometry(0.2, 1.3, 4, 8);
        const legL = new THREE.Mesh(legGeo, darkMat);
        legL.position.set(0.22, 0.9, 0);
        legL.castShadow = true;
        const legR = legL.clone();
        legR.position.x = -0.22;
        this.root.add(legL, legR);

        // Non-racket arm
        const armGeo = new THREE.CapsuleGeometry(0.14, 1.0, 4, 8);
        const armFree = new THREE.Mesh(armGeo, skinMat);
        armFree.position.set(-0.6 * this.facingSign, 2.2, 0.1);
        armFree.rotation.z = 0.3 * this.facingSign;
        armFree.castShadow = true;
        this.root.add(armFree);

        // Racket arm on a pivot at the shoulder, so we can swing the whole arm.
        this.armPivot = new THREE.Group();
        this.armPivot.position.set(0.55 * this.facingSign, 2.55, 0.1);
        this.root.add(this.armPivot);

        const upperArm = new THREE.Mesh(armGeo, skinMat);
        upperArm.position.set(0, -0.5, 0);
        upperArm.castShadow = true;
        this.armPivot.add(upperArm);

        // Racket = handle + head ring + string plane, grouped at the hand.
        this.racket = new THREE.Group();
        this.racket.position.set(0, -1.05, 0);
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xe8e800, roughness: 0.4, metalness: 0.2 });
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 10), handleMat);
        handle.position.y = -0.15;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 24), frameMat);
        ring.position.y = 0.55;
        const strings = new THREE.Mesh(
            new THREE.CircleGeometry(0.4, 20),
            new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
        );
        strings.position.y = 0.55;
        this.racket.add(handle, ring, strings);
        this.racket.castShadow = true;
        this.armPivot.add(this.racket);

        // Rest pose for the racket arm (ready position).
        this.armPivot.rotation.z = -0.4 * this.facingSign;

        // Face toward the net.
        this.root.rotation.y = this.facingSign < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.root.position.set(
            side === 'player' ? COURT.PLAYER_BASELINE_X : COURT.AI_BASELINE_X,
            COURT.FLOOR_Y,
            0,
        );
    }

    /** World position of the racket head — used for ball/racket hit tests. */
    getRacketWorldPosition(target = new THREE.Vector3()): THREE.Vector3 {
        // The string plane sits at local y≈0.55 inside the racket group.
        target.set(0, 0.55, 0);
        return this.racket.localToWorld(target);
    }

    /** Move the character. x = toward/away from net, z = lateral. */
    setPosition(x: number, z: number): void {
        this.root.position.x = x;
        this.root.position.z = z;
    }

    /** Lean/lateral velocity for subtle body english (world Z velocity). */
    setMotion(vz: number): void {
        // Target lean proportional to lateral speed, clamped.
        const targetLean = Math.max(-0.35, Math.min(0.35, -vz * 0.03));
        this.lean += (targetLean - this.lean) * 0.2;
    }

    /** Trigger a visible swing. Ignored if one is already in progress. */
    playSwing(kind: SwingKind): void {
        if (this.swing && this.swing.t < this.swing.duration * 0.6) return;
        this.swing = { kind, t: 0, duration: kind === 'serve' ? 0.55 : 0.42 };
    }

    isSwinging(): boolean {
        return this.swing != null;
    }

    /** Per-frame update: advances swing + idle animation. */
    update(dt: number): void {
        // Idle bob.
        this.bobPhase += dt * 2.2;
        const bob = Math.sin(this.bobPhase) * 0.03;
        this.root.position.y = COURT.FLOOR_Y + bob;

        // Body lean.
        this.root.rotation.z = this.lean;

        // Swing animation drives the arm pivot.
        const f = this.facingSign;
        if (this.swing) {
            this.swing.t += dt;
            const p = Math.min(1, this.swing.t / this.swing.duration);
            // Smooth in/out arc (sine).
            const arc = Math.sin(p * Math.PI);
            if (this.swing.kind === 'forehand') {
                this.armPivot.rotation.z = (-0.4 + arc * 2.2) * f;
                this.armPivot.rotation.x = arc * 0.3;
            } else if (this.swing.kind === 'backhand') {
                this.armPivot.rotation.z = (-0.4 - arc * 2.0) * f;
                this.armPivot.rotation.x = arc * 0.2;
            } else {
                // Serve: raise overhead then snap down.
                this.armPivot.rotation.x = -arc * 2.6;
                this.armPivot.rotation.z = -0.2 * f;
            }
            if (p >= 1) {
                this.swing = null;
                this.armPivot.rotation.set(0, 0, -0.4 * f);
            }
        }
    }

    dispose(scene: THREE.Object3D): void {
        scene.remove(this.root);
        this.root.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
            if (m.material) {
                const mat = m.material as THREE.Material | THREE.Material[];
                Array.isArray(mat) ? mat.forEach((x) => x.dispose()) : mat.dispose();
            }
        });
    }
}
