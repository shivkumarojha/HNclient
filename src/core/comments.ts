import type { CommentNode, HNItem } from "./types.js";

export interface CommentMap {
  [id: number]: HNItem;
}

export const buildCommentTree = (
  rootKids: number[] | undefined,
  map: CommentMap,
  depth = 0,
  parentId?: number
): CommentNode[] => {
  if (!rootKids?.length) {
    return [];
  }

  const nodes: CommentNode[] = [];
  for (const id of rootKids) {
    const item = map[id];
    if (!item || item.type !== "comment" || item.deleted || item.dead) {
      continue;
    }
    const node: CommentNode = {
      id: item.id,
      by: item.by ?? "unknown",
      text: item.text ?? "",
      time: item.time ?? 0,
      depth,
      children: []
    };
    if (parentId !== undefined) {
      node.parentId = parentId;
    }
    node.children = buildCommentTree(item.kids, map, depth + 1, item.id);
    nodes.push(node);
  }
  return nodes;
};

export const flattenCommentTree = (
  nodes: CommentNode[],
  collapsed: Set<number>,
  out: CommentNode[] = []
): CommentNode[] => {
  for (const node of nodes) {
    out.push(node);
    if (!collapsed.has(node.id)) {
      flattenCommentTree(node.children, collapsed, out);
    }
  }
  return out;
};
