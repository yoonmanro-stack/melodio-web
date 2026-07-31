"use client";

import { Suspense } from "react";
import PromptBuilder from "@/components/prompt-builder/PromptBuilder";
import PublicTrackGrid from "@/components/prompt-builder/PublicTrackGrid";

export default function AudioForge() {
  return (
    <div className="h-full w-full overflow-y-auto">
      <Suspense fallback={<div className="p-8 text-zinc-500">Loading Audio Forge...</div>}>
        <PromptBuilder sourceMenu="audio-forge" />
      </Suspense>
      <div className="max-w-6xl mx-auto px-4 pb-24 border-t border-white/5 pt-6 mt-4">
        <PublicTrackGrid sourceMenu="audio-forge" itemsPerPage={16} />
      </div>
    </div>
  );
}
