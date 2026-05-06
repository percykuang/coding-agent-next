// @ts-nocheck
import { Sparkles } from "lucide-react";

export default function App() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-xl space-y-8 text-center">
        {/* Header Section */}
        <div className="space-y-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-indigo-600 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-white shadow-[0_16px_40px_rgba(79,70,229,0.24)] ring-1 ring-indigo-200/60">
            <Sparkles size={28} strokeWidth={2.2} className="text-white" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            开始你的创作
          </h1>
          <p className="text-lg text-gray-600">在聊天框输入你的想法，或者上传文件，让创意落地。</p>
        </div>
      </div>
    </div>
  );
}
