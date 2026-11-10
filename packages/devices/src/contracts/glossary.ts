/**
 * 设备术语表访问入口：词表数据来自 glossary.json（guard 与 TypeScript 侧唯一事实源）。
 * 2.5 命名规范的机器校验都从这里取词，避免多处各写一份逐渐漂移。
 */
import glossary from './glossary.json'

export const GLOSSARY_VERSION: number = glossary.version
export const CANONICAL_TERMS: Readonly<Record<string, string>> = glossary.canonicalTerms
export const FORBIDDEN_STRUCTURE_TERMS: readonly string[] = glossary.forbiddenStructureTerms
export const FORBIDDEN_FILENAME_TERMS: readonly string[] = glossary.forbiddenFilenameTerms
export const FORBIDDEN_METHOD_VERBS: readonly string[] = glossary.forbiddenMethodVerbs
export const FORBIDDEN_BARE_PARAMS: readonly string[] = glossary.forbiddenBareParams
