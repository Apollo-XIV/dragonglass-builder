/** The build the plugin is running, written by `esbuild.config.mjs` on every build. */
declare module "virtual:build-info" {
  /** `git describe --always --dirty`: a short commit hash, `-dirty` if the tree had changes. */
  export const commit: string;
  /** When it was built, as an ISO timestamp. */
  export const builtAt: string;
}
