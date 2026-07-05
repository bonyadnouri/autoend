#!/usr/bin/env node
const required = [23, 6, 0];
const [major, minor, patch] = process.versions.node.split(".").map(Number);

function ok() {
  if (major > required[0]) return true;
  if (major < required[0]) return false;
  if (minor > required[1]) return true;
  if (minor < required[1]) return false;
  return patch >= required[2];
}

if (!ok()) {
  console.error(
    `Node ${required.join(".")}+ required (found ${process.versions.node})`
  );
  process.exit(1);
}
