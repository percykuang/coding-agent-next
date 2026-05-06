"use client";

import { RotateCcw } from "lucide-react";
import type { VersionCardProps } from "@/types/components";

export function VersionCard({ version, projectName, onRollback }: VersionCardProps) {
  return (
    <div className="mt-3 w-full rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-5 shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-gray-900">{projectName}</h3>
            {version.operation && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                {version.operation === "create" ? "创建" : "编辑"}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">Version {version.versionNumber}</p>

          {version.fileCount > 0 && (
            <div className="mt-3 text-sm font-medium text-gray-600">
              Worked with {version.fileCount} files
            </div>
          )}

          {version.changes && (
            <div className="mt-2 flex items-center gap-3 text-xs font-medium">
              {version.changes.added.length > 0 && (
                <span className="text-green-600">+{version.changes.added.length}</span>
              )}
              {version.changes.deleted.length > 0 && (
                <span className="text-red-600">-{version.changes.deleted.length}</span>
              )}
            </div>
          )}
        </div>

        {onRollback && (
          <button
            onClick={onRollback}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-400 hover:bg-gray-50 active:scale-95"
            title="回滚到此版本"
          >
            <RotateCcw size={14} />
            回滚
          </button>
        )}
      </div>
    </div>
  );
}
