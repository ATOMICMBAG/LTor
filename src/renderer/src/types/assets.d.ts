// Binary 3D models imported as URL (web build) or data URL (Electron build,
// see assetsInlineLimit in electron.vite.config.ts).
declare module "*.glb" {
  const url: string;
  export default url;
}
