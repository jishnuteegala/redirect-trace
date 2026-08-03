export function supportsNode18(version: string): boolean {
  return Number(version.split(".")[0]) >= 18;
}

export function nodeRequirementMessage(version: string): string {
  return `redirect-trace requires Node 18 or newer; you are running v${version}. Upgrade: https://nodejs.org`;
}
