"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.joinPath = joinPath;
exports.dirname = dirname;
exports.basename = basename;
exports.exists = exists;
exports.isReadable = isReadable;
exports.isExecutable = isExecutable;
exports.containsPath = containsPath;
exports.isIgnoredWorkspacePath = isIgnoredWorkspacePath;
exports.workspaceContains = workspaceContains;
exports.hasProjectMarker = hasProjectMarker;
exports.nearestProjectRoot = nearestProjectRoot;
exports.nearestProjectRootsFromFile = nearestProjectRootsFromFile;
exports.relativeWorkspacePath = relativeWorkspacePath;

const IGNORED_WORKSPACE_SEGMENTS = new Set(["node_modules", ".git", "dist", "coverage", ".nuxt", ".output"]);

function joinPath(...parts) {
    return nova.path.join(...parts);
}

function dirname(path) {
    const normalized = path.replace(/\/+$/, "");
    const index = normalized.lastIndexOf("/");
    return index > 0 ? normalized.slice(0, index) : "/";
}

function basename(path) {
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
}

function exists(path) {
    try {
        return nova.fs.access(path, nova.fs.F_OK);
    }
    catch {
        return false;
    }
}

function isReadable(path) {
    try {
        return nova.fs.access(path, nova.fs.R_OK);
    }
    catch {
        return false;
    }
}

function isExecutable(path) {
    try {
        return nova.fs.access(path, nova.fs.X_OK);
    }
    catch {
        return false;
    }
}

function containsPath(root, path) {
    return path === root || path.startsWith(`${root}/`);
}

function isIgnoredWorkspacePath(path) {
    if (!path) {
        return false;
    }
    return path.split("/").some((segment) => IGNORED_WORKSPACE_SEGMENTS.has(segment));
}

function workspaceContains(path) {
    if (!path) {
        return "unknown";
    }
    try {
        return nova.workspace.contains(path) ? "yes" : "no";
    }
    catch {
        return "unknown";
    }
}

function hasProjectMarker(path) {
    return exists(joinPath(path, "package.json")) || exists(joinPath(path, "tsconfig.json")) || exists(joinPath(path, "jsconfig.json"));
}

function nearestProjectRoot(filePath, workspaceRoot) {
    let current = dirname(filePath);
    while (containsPath(workspaceRoot, current)) {
        if (hasProjectMarker(current)) {
            return current;
        }
        if (current === workspaceRoot) {
            break;
        }
        current = dirname(current);
    }
    return null;
}

function nearestProjectRootsFromFile(filePath, workspaceRoot) {
    const roots = [];
    let current = dirname(filePath);
    while (containsPath(workspaceRoot, current)) {
        if (hasProjectMarker(current) && !roots.includes(current)) {
            roots.push(current);
        }
        if (current === workspaceRoot) {
            break;
        }
        current = dirname(current);
    }
    return roots;
}

function relativeWorkspacePath(path) {
    const root = nova.workspace.path;
    if (root && containsPath(root, path)) {
        return path === root ? "." : path.slice(root.length + 1);
    }
    return path;
}
