module.exports = {
  hooks: {
    // `typescript` is @tsc-rs/typescript (the catalog entry). Its npm version (0.8.x) is outside
    // vite-plus-core's typescript peer range, so pnpm gave the vite-plus that @effect/vitest
    // imports a real typescript@6 instead, and tests loaded a second vitest.
    readPackage(pkg) {
      if (pkg.name === "@voidzero-dev/vite-plus-core" && pkg.peerDependencies?.typescript) {
        pkg.peerDependencies.typescript = "*";
      }
      return pkg;
    },
  },
};
