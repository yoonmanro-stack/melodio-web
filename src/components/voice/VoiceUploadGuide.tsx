/** Suno's recording advice and Melodio's enforced upload limits are distinct. */
export function VoiceUploadGuide() {
  return (
    <aside aria-label="목소리 샘플 준비 안내" className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-relaxed text-zinc-300">
      <h3 className="font-semibold text-white">어떤 목소리를 올리면 좋나요?</h3>
      <p className="mt-1.5">
        노래용 음색에는 <strong className="text-fuchsia-200">반주 없이 직접 부른 노래</strong>를 권장합니다.
        만들고 싶은 곡의 언어와 창법으로, 본래 음색이 잘 들리는 부분을 녹음해 주세요. 랩을 만들려면 랩 샘플이 좋습니다.
      </p>
      <p className="mt-1.5 text-zinc-400">책 읽기·일반 말소리도 사용할 수 있지만, 노래할 때의 음색을 담으려면 가창 샘플을 준비해 주세요. 다음 단계의 본인 확인은 안내 문구를 말로 읽는 녹음입니다.</p>
      <dl className="mt-3 grid gap-x-4 gap-y-1 border-t border-white/10 pt-3 sm:grid-cols-2">
        <div><dt className="inline text-zinc-500">권장 파일 </dt><dd className="inline">MP3 · WAV</dd></div>
        <div><dt className="inline text-zinc-500">용량 </dt><dd className="inline">파일당 최대 40MB</dd></div>
        <div className="sm:col-span-2"><dt className="inline text-zinc-500">선택 구간 </dt><dd className="inline">업로드 후 6초~2분 선택 · 15초 이상 녹음 권장</dd></div>
      </dl>
      <p className="mt-1 text-[10px] text-zinc-500">파일 형식·용량·선택 구간은 현재 멜로디오 업로드 기준입니다.</p>
      <details className="mt-2 text-zinc-400">
        <summary className="cursor-pointer text-[11px] font-medium text-zinc-300">녹음 팁과 공식 안내 보기</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>조용하고 울림이 적은 곳에서 혼자 녹음해 주세요. 휴대폰 마이크도 사용할 수 있습니다.</li>
          <li>겹친 코러스나 다른 사람의 목소리가 없는 구간을 골라 주세요. 반주가 없는 녹음이 가장 명료합니다.</li>
          <li>M4A · AAC · OGG · WebM도 선택할 수 있습니다. 브라우저에서 읽히지 않으면 MP3나 WAV로 변환해 주세요.</li>
        </ul>
        <p className="mt-2">Suno Voices 도움말은 원본 15초~4분에서 최대 2분을 고르도록 안내합니다. 멜로디오에서는 위의 용량·선택 구간 기준으로 제출합니다.</p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <a href="https://help.suno.com/en/articles/11362369" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">Suno 공식 Voices 안내 ↗</a>
          <a href="https://suno.com/voices" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">Suno 가창 샘플 가이드 ↗</a>
        </p>
      </details>
    </aside>
  );
}
