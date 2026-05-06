/**
 * 类型分析器
 *
 * 从生成的 types/*.ts 文件中提取接口定义和字段元信息。
 * 动态判断字段是否为对象类型，推断安全的渲染属性。
 *
 * 核心思路：通过 TypeScript Compiler API 分析 interface 定义，
 * 区分原始类型 vs 对象类型字段，为后续 AST 规则提供动态依据。
 */

import ts from "typescript";
import type { FieldMeta, TypeMeta, TypeAnalysisResult } from "./types.js";

/** TypeScript 内置原始类型 */
const PRIMITIVE_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "null",
  "undefined",
  "void",
  "never",
  "any",
  "unknown",
  "bigint",
  "symbol",
  "Date",
]);

/** 推断对象类型上最可能用于展示的属性名（优先级排序） */
const DISPLAY_PROPERTY_CANDIDATES = [
  "name",
  "title",
  "label",
  "displayName",
  "text",
  "value",
  "username",
  "email",
  "url",
  "slug",
  "code",
  "description",
];

/**
 * 分析 Record<string, string> 格式的文件集合中所有类型定义
 *
 * @param files - Sandpack 文件集合 { "/types/Article.ts": "export interface ..." }
 * @returns TypeAnalysisResult
 */
export function analyzeTypes(files: Record<string, string>): TypeAnalysisResult {
  const types = new Map<string, TypeMeta>();
  const objectFields = new Map<string, FieldMeta>();

  // 第一遍：收集所有类型名（用于判断字段是否引用了项目内的类型）
  const projectTypeNames = new Set<string>();
  for (const [filePath, content] of Object.entries(files)) {
    if (!isTypeFile(filePath)) continue;
    const names = extractTypeNames(content);
    names.forEach((n) => projectTypeNames.add(n));
  }

  // 第二遍：解析所有类型的字段
  for (const [filePath, content] of Object.entries(files)) {
    if (!isTypeFile(filePath)) continue;
    const parsed = parseTypeFile(content, filePath, projectTypeNames);
    for (const typeMeta of parsed) {
      types.set(typeMeta.name, typeMeta);
    }
  }

  // 第三遍：推断 suggestedProperty（需要交叉查询已解析的类型）
  for (const typeMeta of types.values()) {
    for (const field of typeMeta.fields.values()) {
      if (field.isObject && !field.suggestedProperty) {
        field.suggestedProperty = inferSuggestedProperty(field.typeName, types);
      }
      // 汇总所有对象类型字段
      if (field.isObject) {
        objectFields.set(field.name, field);
      }
    }
  }

  return { types, objectFields };
}

/**
 * 判断文件是否是类型定义文件
 */
function isTypeFile(filePath: string): boolean {
  return (
    filePath.includes("/types/") || filePath.includes("/types\\") || filePath.endsWith(".d.ts")
  );
}

/**
 * 快速提取文件中的所有 interface / type 名称
 */
function extractTypeNames(content: string): string[] {
  const names: string[] = [];
  const sourceFile = ts.createSourceFile("temp.ts", content, ts.ScriptTarget.Latest, true);

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node)) {
      names.push(node.name.text);
    }
    if (ts.isTypeAliasDeclaration(node)) {
      names.push(node.name.text);
    }
    if (ts.isEnumDeclaration(node)) {
      names.push(node.name.text);
    }
  });

  return names;
}

/**
 * 解析单个类型文件，提取所有 interface 定义
 */
function parseTypeFile(
  content: string,
  filePath: string,
  projectTypeNames: Set<string>,
): TypeMeta[] {
  const results: TypeMeta[] = [];

  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  ts.forEachChild(sourceFile, (node) => {
    // 处理 interface 声明
    if (ts.isInterfaceDeclaration(node)) {
      const typeMeta = parseInterfaceDeclaration(node, sourceFile, projectTypeNames);
      results.push(typeMeta);
    }

    // 处理 type alias（对象字面量形式）
    if (ts.isTypeAliasDeclaration(node) && node.type && ts.isTypeLiteralNode(node.type)) {
      const typeMeta = parseTypeLiteral(node.name.text, node.type, sourceFile, projectTypeNames);
      results.push(typeMeta);
    }
  });

  return results;
}

/**
 * 解析 interface 声明
 */
function parseInterfaceDeclaration(
  node: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
  projectTypeNames: Set<string>,
): TypeMeta {
  const fields = new Map<string, FieldMeta>();

  for (const member of node.members) {
    if (ts.isPropertySignature(member) && member.name) {
      const fieldName = member.name.getText(sourceFile);
      const fieldMeta = analyzeFieldType(fieldName, member.type, sourceFile, projectTypeNames);
      fields.set(fieldName, fieldMeta);
    }
  }

  return { name: node.name.text, fields };
}

/**
 * 解析 type 字面量
 */
function parseTypeLiteral(
  name: string,
  node: ts.TypeLiteralNode,
  sourceFile: ts.SourceFile,
  projectTypeNames: Set<string>,
): TypeMeta {
  const fields = new Map<string, FieldMeta>();

  for (const member of node.members) {
    if (ts.isPropertySignature(member) && member.name) {
      const fieldName = member.name.getText(sourceFile);
      const fieldMeta = analyzeFieldType(fieldName, member.type, sourceFile, projectTypeNames);
      fields.set(fieldName, fieldMeta);
    }
  }

  return { name, fields };
}

/**
 * 分析单个字段的类型
 */
function analyzeFieldType(
  name: string,
  typeNode: ts.TypeNode | undefined,
  sourceFile: ts.SourceFile,
  projectTypeNames: Set<string>,
): FieldMeta {
  if (!typeNode) {
    return {
      name,
      isObject: false,
      typeName: "any",
      isArray: false,
      properties: [],
      suggestedProperty: null,
    };
  }

  const typeText = typeNode.getText(sourceFile);

  // 数组类型: T[] 或 Array<T>
  if (ts.isArrayTypeNode(typeNode)) {
    const elementType = typeNode.elementType;
    const elementTypeName = elementType.getText(sourceFile);
    const isElementObject = isObjectType(elementTypeName, projectTypeNames);
    return {
      name,
      isObject: isElementObject,
      typeName: elementTypeName,
      isArray: true,
      properties: [],
      suggestedProperty: null,
    };
  }

  // Array<T> 引用类型
  if (
    ts.isTypeReferenceNode(typeNode) &&
    typeNode.typeName.getText(sourceFile) === "Array" &&
    typeNode.typeArguments?.length
  ) {
    const elementType = typeNode.typeArguments[0];
    const elementTypeName = elementType.getText(sourceFile);
    const isElementObject = isObjectType(elementTypeName, projectTypeNames);
    return {
      name,
      isObject: isElementObject,
      typeName: elementTypeName,
      isArray: true,
      properties: [],
      suggestedProperty: null,
    };
  }

  // 类型引用（可能是项目内类型或第三方类型）
  if (ts.isTypeReferenceNode(typeNode)) {
    const refName = typeNode.typeName.getText(sourceFile);
    const isObj = isObjectType(refName, projectTypeNames);
    return {
      name,
      isObject: isObj,
      typeName: refName,
      isArray: false,
      properties: [],
      suggestedProperty: null,
    };
  }

  // 内联对象类型 { key: value }
  if (ts.isTypeLiteralNode(typeNode)) {
    const props: string[] = [];
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        props.push(member.name.getText(sourceFile));
      }
    }
    return {
      name,
      isObject: true,
      typeName: typeText,
      isArray: false,
      properties: props,
      suggestedProperty: inferFromPropertyList(props),
    };
  }

  // 联合类型 A | B - 如果任一分支是对象类型则标记
  if (ts.isUnionTypeNode(typeNode)) {
    for (const member of typeNode.types) {
      if (ts.isTypeReferenceNode(member)) {
        const refName = member.typeName.getText(sourceFile);
        if (isObjectType(refName, projectTypeNames)) {
          return {
            name,
            isObject: true,
            typeName: refName,
            isArray: false,
            properties: [],
            suggestedProperty: null,
          };
        }
      }
    }
  }

  // 其他情况按原始类型处理
  return {
    name,
    isObject: false,
    typeName: typeText,
    isArray: false,
    properties: [],
    suggestedProperty: null,
  };
}

/**
 * 判断类型名是否为对象类型
 * 满足以下条件之一为对象类型：
 * 1. 项目内定义的类型（如 Author, Category）
 * 2. 非原始类型且非内置类型
 */
function isObjectType(typeName: string, projectTypeNames: Set<string>): boolean {
  if (PRIMITIVE_TYPES.has(typeName)) return false;
  if (projectTypeNames.has(typeName)) return true;
  // 首字母大写且非原始类型，大概率是对象类型
  if (/^[A-Z]/.test(typeName) && !PRIMITIVE_TYPES.has(typeName)) {
    return true;
  }
  return false;
}

/**
 * 推断对象类型的推荐展示属性
 * 查找目标类型的字段列表，选择最适合展示的字符串属性
 */
function inferSuggestedProperty(typeName: string, types: Map<string, TypeMeta>): string | null {
  const targetType = types.get(typeName);
  if (!targetType) return null;

  return inferFromFieldMap(targetType.fields);
}

/**
 * 从字段 Map 推断展示属性
 */
function inferFromFieldMap(fields: Map<string, FieldMeta>): string | null {
  // 优先匹配候选列表
  for (const candidate of DISPLAY_PROPERTY_CANDIDATES) {
    const field = fields.get(candidate);
    if (field && !field.isObject && !field.isArray) {
      return candidate;
    }
  }
  // 回退：找第一个字符串类型且非 id 的字段
  for (const [fieldName, field] of fields) {
    if (fieldName !== "id" && field.typeName === "string" && !field.isObject && !field.isArray) {
      return fieldName;
    }
  }
  return null;
}

/**
 * 从属性名列表推断展示属性
 */
function inferFromPropertyList(props: string[]): string | null {
  for (const candidate of DISPLAY_PROPERTY_CANDIDATES) {
    if (props.includes(candidate)) return candidate;
  }
  return props.find((p) => p !== "id") ?? null;
}
