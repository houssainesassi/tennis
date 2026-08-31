/** @type {import('next').NextConfig} */
const nextConfig = {
    // Disabled: this app mounts the original vanilla Three.js renderer imperatively
    // in a useEffect. StrictMode's intentional double-invoke of effects double-mounts
    // the canvas / breaks the one-time engine spawn. Standard fix for imperative canvas.
    reactStrictMode: false,
    // Allow an isolated build dir (used only during dev verification to avoid two
    // dev servers sharing/clobbering the same .next). Defaults to the normal .next.
    distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
