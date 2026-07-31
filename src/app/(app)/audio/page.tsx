"use client";

import { Suspense } from "react";
import PresetStudioBuilder from "@/components/prompt-builder/PresetStudioBuilder";
import PublicTrackGrid from "@/components/prompt-builder/PublicTrackGrid";

export default function PresetStudioPage() {
  return (
    <div className="h-full w-full overflow-y-auto">
      <Suspense fallback={<div className="p-8 text-zinc-500">Loading Preset Studio...</div>}>
        <PresetStudioBuilder sourceMenu="preset-studio" />
      </Suspense>
      <div className="max-w-6xl mx-auto px-4 pb-24 border-t border-white/5 pt-6 mt-4">
        <PublicTrackGrid sourceMenu="preset-studio" itemsPerPage={16} />
      </div>
    </div>
  );
}
