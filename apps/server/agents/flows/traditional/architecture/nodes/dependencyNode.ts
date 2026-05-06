import { readTemplatePackageJson } from "../../../../utils/dependencyBuilder.js";

/**
 * Step 6: 依赖分析节点（程序化）
 *
 * 不再调用 LLM 推断依赖。
 * 此节点仅负责读取模板 package.json 作为基座。
 * 真正的 import 扫描在 assembleNode 中完成（彼时所有代码文件已生成）。
 *
 * 职责：
 *  1. 读取模板 package.json
 *  2. 返回到 state.dependency，供后续 assembleNode 使用
 *
 * 保留节点名 "dependencyNode"，前端步骤 "依赖分析" 不受影响。
 */
export async function dependencyNode(state: any) {
  console.log("--- DependencyNode (Programmatic) Start ---");

  // 1. 读取模板 package.json
  const templatePackageJson = await readTemplatePackageJson();

  console.log(
    "[DependencyNode] Template dependencies:",
    Object.keys(templatePackageJson.dependencies || {}).length,
    "packages",
  );

  console.log("--- DependencyNode (Programmatic) End ---");

  // 2. 返回模板作为基座
  // 实际的 import 扫描 + 依赖补充在 assembleNode 完成
  return {
    dependency: {
      packageJson: templatePackageJson,
      dependencies: {},
      reason: "模板基座依赖已加载，import 扫描将在组装阶段完成",
    },
  };
}
