import { useChatStore } from "@/store/chatStore";
import { PHASE_INFO } from "@/constants/chat";
import type { Phase } from "@/types/flow";
import type { ThoughtChainProps } from "@/types/components";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Layers,
  ChevronDown,
  ChevronRight,
  Archive,
} from "lucide-react";

function StatusIcon({
  status,
  sizeClass = "w-4 h-4",
}: {
  status?: "pending" | "success" | "error" | "cancelled";
  sizeClass?: string;
}) {
  if (status === "success") {
    return <CheckCircle2 className={`${sizeClass} text-green-500`} />;
  }

  if (status === "pending") {
    return <Loader2 className={`${sizeClass} animate-spin text-blue-500`} />;
  }

  if (status === "error") {
    return <AlertCircle className={`${sizeClass} text-red-500`} />;
  }

  if (status === "cancelled") {
    return <AlertCircle className={`${sizeClass} text-gray-400`} />;
  }

  return <Circle className={`${sizeClass} text-gray-300`} />;
}

/** 根据阶段所属流程返回是否为 Figma 流程 */
function isFigmaPhase(phase?: string): boolean {
  if (!phase) return false;
  const info = PHASE_INFO[phase as Phase];
  return info?.flow === "figma";
}

export function ThoughtChain({ thoughts }: ThoughtChainProps) {
  const { togglePhaseExpansion, toggleHistoryExpansion, currentFlow } = useChatStore();

  if (!thoughts.length) return null;

  return (
    <div className="flex max-w-full flex-col gap-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
      {/* 流程类型标识 */}
      {currentFlow && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span
            className={`rounded px-2 py-0.5 ${
              currentFlow === "figma" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-600"
            }`}
          >
            {currentFlow === "figma" ? "🎨 Figma 快速生成" : "📝 标准流程"}
          </span>
        </div>
      )}
      {thoughts.map((thought, index) => {
        const isLast = index === thoughts.length - 1;
        const isPhase = thought.type === "phase";
        const isHistory = thought.type === "history";

        return (
          <div key={thought.key}>
            <div className="flex items-start gap-3">
              <div className="relative mt-0.5">
                {/* 历史记录：使用 Archive 图标 */}
                {isHistory && <Archive className="h-4 w-4 text-gray-500" />}

                {/* 阶段级：使用 Layers 图标，根据流程类型调整颜色 */}
                {isPhase && (
                  <Layers
                    className={`h-4 w-4 ${
                      isFigmaPhase(thought.phase) ? "text-blue-500" : "text-purple-500"
                    }`}
                  />
                )}

                {/* 节点级：根据状态显示图标 */}
                {!isPhase && !isHistory && <StatusIcon status={thought.status} />}

                {/* Connecting line */}
                {!isLast && (
                  <div
                    className="absolute top-5 left-2 -z-10 h-full w-px bg-gray-200"
                    style={{ height: "calc(100% + 4px)" }}
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1">
                {/* 历史记录：灰色风格，可展开 */}
                {isHistory ? (
                  <>
                    <div
                      className="-mx-2 flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-gray-50"
                      onClick={() => toggleHistoryExpansion(thought.key)}
                    >
                      {/* 展开/收起图标 */}
                      {thought.expanded ? (
                        <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-600" />
                      ) : (
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-600" />
                      )}
                      <span className="text-sm font-semibold text-gray-700">{thought.title}</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {thought.historyThoughts?.length || 0} 项
                      </span>
                    </div>
                    <span className="ml-6 text-xs text-gray-500">{thought.description}</span>

                    {/* 展开时显示历史思维链 */}
                    {thought.expanded && thought.historyThoughts && (
                      <div className="mt-2 ml-6 space-y-2 border-l-2 border-gray-200 pl-3">
                        {thought.historyThoughts.map((historyThought) => {
                          const isHistoryPhase = historyThought.type === "phase";

                          return (
                            <div key={historyThought.key} className="flex flex-col gap-0.5">
                              {/* 如果是阶段，显示阶段样式 */}
                              {isHistoryPhase ? (
                                <div className="flex items-center gap-2">
                                  <Layers className="h-3 w-3 flex-shrink-0 text-purple-400" />
                                  <span className="text-xs font-medium text-purple-600">
                                    {historyThought.title}
                                  </span>
                                  <span className="text-xs text-purple-500">
                                    {historyThought.nodeCount} 步骤
                                  </span>
                                </div>
                              ) : (
                                /* 如果是节点，显示节点样式 */
                                <>
                                  <div className="flex items-center gap-2">
                                    <StatusIcon
                                      status={historyThought.status}
                                      sizeClass="w-3 h-3"
                                    />
                                    <span className="text-xs font-medium text-gray-700">
                                      {historyThought.title}
                                    </span>
                                  </div>
                                  {historyThought.description && (
                                    <span className="ml-5 text-xs text-gray-500">
                                      {historyThought.description}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : isPhase ? (
                  <>
                    <div
                      className={`-mx-2 flex cursor-pointer items-center gap-2 rounded px-2 py-1 transition-colors ${
                        isFigmaPhase(thought.phase) ? "hover:bg-blue-50" : "hover:bg-purple-50"
                      }`}
                      onClick={() => togglePhaseExpansion(thought.key)}
                    >
                      {/* 展开/收起图标 */}
                      {thought.expanded ? (
                        <ChevronDown
                          className={`h-4 w-4 flex-shrink-0 ${
                            isFigmaPhase(thought.phase) ? "text-blue-600" : "text-purple-600"
                          }`}
                        />
                      ) : (
                        <ChevronRight
                          className={`h-4 w-4 flex-shrink-0 ${
                            isFigmaPhase(thought.phase) ? "text-blue-600" : "text-purple-600"
                          }`}
                        />
                      )}
                      <span
                        className={`text-sm font-semibold ${
                          isFigmaPhase(thought.phase) ? "text-blue-700" : "text-purple-700"
                        }`}
                      >
                        {thought.title}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          isFigmaPhase(thought.phase)
                            ? "bg-blue-100 text-blue-600"
                            : "bg-purple-100 text-purple-600"
                        }`}
                      >
                        {thought.nodeCount} 步骤
                      </span>
                    </div>
                    <span className="ml-6 text-xs text-gray-600">{thought.description}</span>

                    {/* 展开时显示节点详情 */}
                    {thought.expanded && thought.nodeDetails && (
                      <div
                        className={`mt-2 ml-6 space-y-2 border-l-2 pl-3 ${
                          isFigmaPhase(thought.phase) ? "border-blue-200" : "border-purple-200"
                        }`}
                      >
                        {thought.nodeDetails.map((node) => (
                          <div key={node.key} className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-green-500" />
                              <span className="text-xs font-medium text-gray-700">
                                {node.title}
                              </span>
                            </div>
                            {node.description && (
                              <span className="ml-5 text-xs text-gray-500">{node.description}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  /* 节点级：保持原样式 */
                  <>
                    <span
                      className={`text-sm font-medium ${
                        thought.status === "pending"
                          ? "text-blue-600"
                          : thought.status === "cancelled"
                            ? "text-gray-500"
                            : "text-gray-700"
                      }`}
                    >
                      {thought.title}
                    </span>
                    {thought.description && (
                      <span className="text-xs leading-tight text-gray-500">
                        {thought.description}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
