const fs = require("fs");
const path = require("path");

// lucide-react-native's index re-exports every icon (about 1,900 modules), and Metro bundles all of them for one named
// import. Each value import from it becomes an import of that name's own module, read from the index's export lines.
// lucide-react, the web package the copied src/lib files import, gets the same native icons. An unknown name fails the
// bundle, so nothing reaches the index by accident.
const LUCIDE_EXPORTS = new Map();
const index = fs.readFileSync(path.join(require.resolve("lucide-react-native"), "../../esm/lucide-react-native.mjs"), "utf8");
for (const [, names, file] of index.matchAll(/export \{([^}]*)\} from '\.\/(.+)\.mjs'/g)) {
  for (const name of names.split(",")) {
    const [imported, exported = imported] = name.trim().split(/\s+as\s+/);
    // "./icons/*" is in the package's exports; the few other files (createLucideIcon) resolve by path (metro.config.js).
    LUCIDE_EXPORTS.set(exported, { imported, source: file.startsWith("icons/") ? `lucide-react-native/${file}` : `lucide-react-native/dist/esm/${file}.mjs` });
  }
}

function lucideModules({ types: t }) {
  return {
    visitor: {
      ImportDeclaration(p) {
        const { node } = p;
        if (!["lucide-react-native", "lucide-react"].includes(node.source.value) || node.importKind === "type") return;
        p.replaceWithMultiple(
          node.specifiers
            .filter((s) => s.importKind !== "type")
            .map((s) => {
              const e = t.isImportSpecifier(s) && LUCIDE_EXPORTS.get(s.imported.name);
              if (!e) throw p.buildCodeFrameError(`${node.source.value}: import icons by name, and types with "type"`);
              const spec = e.imported === "default" ? t.importDefaultSpecifier(s.local) : t.importSpecifier(s.local, t.identifier(e.imported));
              return t.importDeclaration([spec], t.stringLiteral(e.source));
            }),
        );
      },
    },
  };
}

module.exports = function (api) {
  api.cache(true);
  return {
    // lazyImports: a package import loads when first used, not when the app starts (Expo keeps packages with side
    // effects eager, and the app's own files stay eager).
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind", lazyImports: true }], "nativewind/babel"],
    plugins: [lucideModules],
  };
};
