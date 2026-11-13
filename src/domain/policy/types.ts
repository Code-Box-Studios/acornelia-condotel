export type PolicySnapshot = { id: string; revision: number; approvedSections: string[]; sections: Record<string, unknown>; synthetic?: boolean }
