// =====================================================
// SRM Full Stack Engineering Challenge — Backend API
// POST /bfhl
// =====================================================

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static("public")); // serves your frontend

// ── YOUR DETAILS — fill these in ──────────────────
const USER_ID = "Tummalapudi Usha_16082006";         // e.g. "johndoe_17091999"
const EMAIL_ID = "usha_tummalapudi@srmap.edu.in";     // your college email
const COLLEGE_ROLL = "AP23110010209";             // your roll number

// ── Validation helper ─────────────────────────────
// Valid format: single uppercase letter -> single uppercase letter
// e.g.  A->B  is valid
// Trims whitespace first, then checks
function isValidEntry(raw) {
  const entry = raw.trim();
  // Must match exactly: one uppercase letter, ->, one uppercase letter
  const pattern = /^([A-Z])->([A-Z])$/;
  const match = entry.match(pattern);
  if (!match) return false;
  // Self-loop is invalid (A->A)
  if (match[1] === match[2]) return false;
  return true;
}

// ── Cycle detection using DFS ─────────────────────
// Returns true if there is a cycle starting from 'node'
// visited  = nodes fully processed
// inStack  = nodes currently on the DFS call stack
function hasCycleDFS(node, adjacency, visited, inStack) {
  visited.add(node);
  inStack.add(node);

  const children = adjacency[node] || [];
  for (const child of children) {
    if (!visited.has(child)) {
      if (hasCycleDFS(child, adjacency, visited, inStack)) return true;
    } else if (inStack.has(child)) {
      return true;
    }
  }

  inStack.delete(node);
  return false;
}

// ── Build nested tree object recursively ──────────
function buildTree(node, adjacency, seen = new Set()) {
  if (seen.has(node)) return {}; // safety: shouldn't hit for valid trees
  seen.add(node);
  const children = adjacency[node] || [];
  const obj = {};
  for (const child of children) {
    obj[child] = buildTree(child, adjacency, new Set(seen));
  }
  return obj;
}

// ── Calculate depth (longest root-to-leaf path in node count) ──
function calcDepth(node, adjacency, memo = {}) {
  if (memo[node] !== undefined) return memo[node];
  const children = adjacency[node] || [];
  if (children.length === 0) {
    memo[node] = 1;
    return 1;
  }
  let max = 0;
  for (const child of children) {
    const d = calcDepth(child, adjacency, memo);
    if (d > max) max = d;
  }
  memo[node] = 1 + max;
  return memo[node];
}

// ── Main POST /bfhl route ─────────────────────────
app.post("/bfhl", (req, res) => {
  const data = req.body.data;

  // Basic input guard
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: "Request body must have a 'data' array." });
  }

  // ── Step 1: Separate valid vs invalid entries ──
  const invalid_entries = [];
  const validRaw = [];       // trimmed valid strings like "A->B"
  const seenEdges = new Set(); // tracks first occurrence
  const duplicate_edges = [];

  for (const item of data) {
    if (typeof item !== "string") {
      invalid_entries.push(String(item));
      continue;
    }
    const trimmed = item.trim();
    if (!isValidEntry(trimmed)) {
      invalid_entries.push(trimmed === item ? item : item); // push original
      continue;
    }
    // Valid entry — check for duplicate
    if (seenEdges.has(trimmed)) {
      // Only push once to duplicate_edges (per unique edge)
      if (!duplicate_edges.includes(trimmed)) {
        duplicate_edges.push(trimmed);
      }
      // Do NOT add to validRaw again
    } else {
      seenEdges.add(trimmed);
      validRaw.push(trimmed);
    }
  }

  // ── Step 2: Parse edges and build adjacency list ──
  // adjacency: { parent: [child, child, ...] }
  const adjacency = {};      // only one parent per child (first-wins rule)
  const childSet = new Set(); // all nodes that appear as children
  const parentSet = new Set(); // all nodes that appear as parents
  const allNodes = new Set(); // every node seen

  for (const edge of validRaw) {
    const [parent, child] = edge.split("->");

    allNodes.add(parent);
    allNodes.add(child);
    parentSet.add(parent);

    // Multi-parent rule: if child already has a parent, discard this edge silently
    if (childSet.has(child)) {
      // silently discard — do NOT add to duplicate_edges
      continue;
    }
    childSet.add(child);

    if (!adjacency[parent]) adjacency[parent] = [];
    adjacency[parent].push(child);
  }

  // ── Step 3: Find root nodes ──
  // A root is a node that never appears as a child
  const roots = [];
  for (const node of allNodes) {
    if (!childSet.has(node)) {
      roots.push(node);
    }
  }
  roots.sort(); // lexicographic order for consistency

  // ── Step 4: Find all connected components (groups) ──
  // We do BFS/DFS from each root to find its group
  // Then handle pure cycles (nodes with no natural root)
  const assignedNodes = new Set();

  // Build an undirected adjacency for grouping purposes
  const undirected = {};
  for (const node of allNodes) undirected[node] = new Set();
  for (const [parent, children] of Object.entries(adjacency)) {
    for (const child of children) {
      undirected[parent].add(child);
      undirected[child].add(parent);
    }
  }

  function getComponent(startNode) {
    const component = new Set();
    const queue = [startNode];
    while (queue.length) {
      const n = queue.shift();
      if (component.has(n)) continue;
      component.add(n);
      for (const neighbor of (undirected[n] || [])) {
        if (!component.has(neighbor)) queue.push(neighbor);
      }
    }
    return component;
  }

  const groups = []; // each group: { nodes: Set, root: string }

  // First, process roots
  for (const root of roots) {
    if (assignedNodes.has(root)) continue;
    const component = getComponent(root);
    component.forEach(n => assignedNodes.add(n));
    groups.push({ root, nodes: component });
  }

  // Then, find nodes not yet assigned (pure cycles — no natural root)
  const unassigned = [...allNodes].filter(n => !assignedNodes.has(n));
  // Group them into their components
  const tempAssigned = new Set();
  for (const node of unassigned) {
    if (tempAssigned.has(node)) continue;
    const component = getComponent(node);
    component.forEach(n => tempAssigned.add(n));
    // Pick lexicographically smallest node as root
    const cycleRoot = [...component].sort()[0];
    groups.push({ root: cycleRoot, nodes: component });
    component.forEach(n => assignedNodes.add(n));
  }

  // ── Step 5: For each group, detect cycle and build hierarchy ──
  const hierarchies = [];
  let total_trees = 0;
  let total_cycles = 0;
  let largest_tree_root = null;
  let largest_tree_depth = -1;

  for (const group of groups) {
    const { root } = group;

    // Check for cycle in this component using DFS
    const visited = new Set();
    const inStack = new Set();
    let cycleFound = false;

    // DFS from root
    function dfsCheck(node) {
      if (inStack.has(node)) { cycleFound = true; return; }
      if (visited.has(node)) return;
      visited.add(node);
      inStack.add(node);
      for (const child of (adjacency[node] || [])) {
        dfsCheck(child);
        if (cycleFound) return;
      }
      inStack.delete(node);
    }
    dfsCheck(root);

    if (cycleFound) {
      // Cyclic group
      hierarchies.push({
        root,
        tree: {},
        has_cycle: true
      });
      total_cycles++;
    } else {
      // Non-cyclic tree
      const treeObj = {};
      treeObj[root] = buildTree(root, adjacency);
      const depth = calcDepth(root, adjacency);

      hierarchies.push({
        root,
        tree: treeObj,
        depth
      });
      total_trees++;

      // Track largest tree (tiebreak: lexicographically smaller root wins)
      if (
        depth > largest_tree_depth ||
        (depth === largest_tree_depth && root < largest_tree_root)
      ) {
        largest_tree_depth = depth;
        largest_tree_root = root;
      }
    }
  }

  // ── Step 6: Build and return final response ──
  const response = {
    user_id: USER_ID,
    email_id: EMAIL_ID,
    college_roll_number: COLLEGE_ROLL,
    hierarchies,
    invalid_entries,
    duplicate_edges,
    summary: {
      total_trees,
      total_cycles,
      largest_tree_root: largest_tree_root || ""
    }
  };

  return res.status(200).json(response);
});

// ── Health check ──────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// ── Start server ──────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`📡 POST /bfhl is ready`);
});
