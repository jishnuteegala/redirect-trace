import type { ParamDiff } from "./model.js";

export type QueryParams = Map<string, string[]>;

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseQuery(url: string): QueryParams {
  const query = new URL(url).search.slice(1);
  const params: QueryParams = new Map();
  if (query === "") return params;
  for (const part of query.split("&")) {
    const equals = part.indexOf("=");
    const key = decode(equals < 0 ? part : part.slice(0, equals));
    const value = decode(equals < 0 ? "" : part.slice(equals + 1));
    params.set(key, [...(params.get(key) ?? []), value]);
  }
  return params;
}

function sameValues(before: string[], after: string[]): boolean {
  return before.length === after.length && before.every((value, index) => value === after[index]);
}

export function diffParams(beforeUrl: string, afterUrl: string): ParamDiff {
  const before = parseQuery(beforeUrl);
  const after = parseQuery(afterUrl);
  const keys = [...new Set([...before.keys(), ...after.keys()])];
  const diff: ParamDiff = { added: [], dropped: [], changed: [] };
  for (const key of keys) {
    const oldValues = before.get(key);
    const newValues = after.get(key);
    if (oldValues === undefined && newValues !== undefined)
      diff.added.push({ key, values: newValues });
    else if (oldValues !== undefined && newValues === undefined)
      diff.dropped.push({ key, values: oldValues });
    else if (
      oldValues !== undefined &&
      newValues !== undefined &&
      !sameValues(oldValues, newValues)
    )
      diff.changed.push({ key, before: oldValues, after: newValues });
  }
  return diff;
}
