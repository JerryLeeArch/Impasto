const MIN_NODE_MAJOR = 24;

const major = Number(process.versions.node.split(".")[0]);

if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
  console.error(
    `Impasto requires Node.js ${MIN_NODE_MAJOR}+ because it uses the built-in SQLite runtime.`,
  );
  console.error(`Current Node.js version: ${process.versions.node}`);
  console.error("Install the version listed in .nvmrc or .node-version.");
  process.exit(1);
}
