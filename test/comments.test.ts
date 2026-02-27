import { describe, expect, it } from "vitest";
import { buildCommentTree, flattenCommentTree } from "../src/core/comments.js";

describe("comment tree", () => {
  it("builds and flattens a threaded tree", () => {
    const map = {
      1: { id: 1, type: "comment", text: "root", kids: [2, 3] },
      2: { id: 2, type: "comment", text: "child", kids: [4] },
      3: { id: 3, type: "comment", text: "sibling", kids: [] },
      4: { id: 4, type: "comment", text: "leaf", kids: [] }
    } as const;

    const tree = buildCommentTree([1], map as never);
    expect(tree.length).toBe(1);
    expect(tree[0]?.children.length).toBe(2);

    const full = flattenCommentTree(tree, new Set());
    expect(full.map((node) => node.id)).toEqual([1, 2, 4, 3]);

    const collapsed = flattenCommentTree(tree, new Set([2]));
    expect(collapsed.map((node) => node.id)).toEqual([1, 2, 3]);
  });
});
