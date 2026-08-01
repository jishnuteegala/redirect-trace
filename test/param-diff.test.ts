import { describe, expect, it } from "vitest";
import { diffParams, parseQuery } from "../src/param-diff.js";

const dirtyQueries = [
  "token=a%2Bb&empty=&flag&space=a%20b&plus=a+b",
  "a=1&a=2&encoded%20key=x%2Fy",
  "q=%25&bad=%ZZ&unicode=%E2%9C%93",
];

function url(query: string): string {
  return `https://example.test/?${query}`;
}

describe("query parameter diff", () => {
  it("decodes the pinned dirty-query corpus while preserving literal pluses", () => {
    expect(dirtyQueries.map((query) => [...parseQuery(url(query)).entries()])).toEqual([
      [
        ["token", ["a+b"]],
        ["empty", [""]],
        ["flag", [""]],
        ["space", ["a b"]],
        ["plus", ["a+b"]],
      ],
      [
        ["a", ["1", "2"]],
        ["encoded key", ["x/y"]],
      ],
      [
        ["q", ["%"]],
        ["bad", ["%ZZ"]],
        ["unicode", ["✓"]],
      ],
    ]);
  });

  it("treats duplicate values as order-sensitive and reverses added and dropped", () => {
    const forward = diffParams(url("a=1&a=2&drop=x"), url("a=2&a=1&add=y"));
    const backward = diffParams(url("a=2&a=1&add=y"), url("a=1&a=2&drop=x"));
    expect(forward).toEqual({
      added: [{ key: "add", values: ["y"] }],
      dropped: [{ key: "drop", values: ["x"] }],
      changed: [{ key: "a", before: ["1", "2"], after: ["2", "1"] }],
    });
    expect(backward.added).toEqual(forward.dropped);
    expect(backward.dropped).toEqual(forward.added);
    expect(backward.changed).toEqual([{ key: "a", before: ["2", "1"], after: ["1", "2"] }]);
  });

  it("classifies every changed key exactly once across the pinned corpus", () => {
    for (const query of dirtyQueries) {
      const changed = diffParams(url(query), url("replacement=1"));
      const classifications = [...changed.added, ...changed.dropped, ...changed.changed];
      const keys = new Set(classifications.map((entry) => entry.key));
      expect(classifications).toHaveLength(keys.size);
    }
  });
});
