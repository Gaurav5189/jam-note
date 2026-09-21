import type { Note, NoteTreeItem } from "@/lib/types";

// Pure tree operations mirroring the backend's hierarchy semantics in
// fastapi_backend/notes/service.py, so optimistic sidebar updates stay in
// sync with what MongoDB actually stores.

function toTreeItem(note: Note): NoteTreeItem {
  return { ...note, children: [] };
}

/** Insert a freshly created note under its parent, or as a root. */
export function insertTreeItem(
  nodes: NoteTreeItem[],
  item: NoteTreeItem
): NoteTreeItem[] {
  if (item.parent_id === null) return [...nodes, item];

  let found = false;
  const walk = (items: NoteTreeItem[]): NoteTreeItem[] => {
    let changed = false;
    const result = items.map((node) => {
      if (node.id === item.parent_id) {
        found = true;
        changed = true;
        return { ...node, children: [...node.children, item] };
      }
      const newChildren = walk(node.children);
      if (newChildren !== node.children) {
        changed = true;
        return { ...node, children: newChildren };
      }
      return node;
    });
    return changed ? result : items;
  };
  const result = walk(nodes);

  // Parent missing from the whole tree — surface the note as a root so it
  // stays visible (same guarantee as the backend's build_tree). This
  // fallback must consider the ENTIRE tree: firing it per-subtree used to
  // append the note to every leaf's children, duplicating it all over the
  // sidebar and the dashboard's flattened list (duplicate React keys).
  return found ? result : [...nodes, item];
}

/** Remove a note, lifting its children into its own slot (delete cascade). */
export function removeTreeItem(
  nodes: NoteTreeItem[],
  id: string
): NoteTreeItem[] {
  const walk = (items: NoteTreeItem[]): NoteTreeItem[] => {
    let changed = false;
    const result: NoteTreeItem[] = [];
    for (const node of items) {
      if (node.id === id) {
        changed = true;
        result.push(...node.children);
        continue;
      }
      const newChildren = walk(node.children);
      if (newChildren !== node.children) {
        changed = true;
        result.push({ ...node, children: newChildren });
      } else {
        result.push(node);
      }
    }
    return changed ? result : items;
  };
  return walk(nodes);
}

/** Patch a note (e.g. renamed title) anywhere in the tree. */
export function updateTreeItem(
  nodes: NoteTreeItem[],
  id: string,
  patch: Partial<NoteTreeItem>
): NoteTreeItem[] {
  const walk = (items: NoteTreeItem[]): NoteTreeItem[] => {
    let changed = false;
    const result = items.map((node) => {
      if (node.id === id) {
        changed = true;
        return { ...node, ...patch };
      }
      const newChildren = walk(node.children);
      if (newChildren !== node.children) {
        changed = true;
        return { ...node, children: newChildren };
      }
      return node;
    });
    return changed ? result : items;
  };
  return walk(nodes);
}

/** Find a note and its ancestor chain: [root, ..., parent, note]. */
export function findNotePath(
  nodes: NoteTreeItem[],
  id: string
): NoteTreeItem[] | null {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const inChildren = findNotePath(node.children, id);
    if (inChildren) return [node, ...inChildren];
  }
  return null;
}

/** Flatten the tree to a list of every note (for recent-notes views). */
export function flattenTree(nodes: NoteTreeItem[]): NoteTreeItem[] {
  const result: NoteTreeItem[] = [];
  const walk = (items: NoteTreeItem[]) => {
    for (const node of items) {
      result.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

export { toTreeItem };
