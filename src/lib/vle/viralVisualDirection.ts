/** Shared visual defaults. They fill unspecified choices, never rewrite a story's cast or era. */
export function buildViralVisualDirection(categoryId: string): string {
  const setting = categoryId === 'history'
    ? 'PRODUCTION DESIGN: Choose a polished, coherent setting appropriate to the story’s historical period. Preserve any authored modern parody or time travel. Use convincing materials and cinematic light rather than accidentally dated generic furnishings.'
    : categoryId === 'ai_future'
      ? 'PRODUCTION DESIGN: Choose a coherent, deliberately designed future environment appropriate to the story, with clear material and lighting choices. Preserve a present-day home or office if the supplied story sets the event there.'
      : 'PRODUCTION DESIGN DEFAULT: Use a believable contemporary Korean everyday setting appropriate to the action: apartment, office, cafe or street. For an unspecified home, select a few modern details such as a simple upholstered platform bed, coordinated solid-color bedding, clean warm-white walls, light oak furniture and a compact modern lamp. Make it comfortably lived-in and relatable, with soft flattering light appropriate to the actual time of day; a 3 AM scene remains nighttime. Choose fresh layouts, palettes and details for new stories, then keep the chosen set consistent within the video.';
  return [
    'COMMON VISUAL DEFAULTS: Fill only unspecified visual choices. The full sourceTopic, named roles, required people, explicit appearance, age, location and historical era take priority over these defaults.',
    'CASTING DEFAULT: If the story needs an adult human whose gender and appearance are unspecified, prefer a pretty, charming adult woman in her twenties or thirties, with a cute, warm impression, natural styling and modern clothing appropriate to the scene. Select a distinct face, hair and outfit for each new story and freeze them within that video. Preserve explicit or role-implied male characters such as a husband, father or boyfriend, source-specified women and older characters, and children’s authored ages and roles. Preserve every required character identity and person count, including both partners in a couple. Introduce a human only where useful to the story; explicit no-human stories show no humans.',
    setting,
    'TRANSLATION TO MEDIA: Freeze concise person profiles and concrete set/material/light choices in the approved visual brief. Use the same selected identities and set in all authored images and video segments. Story action and readable reactions determine framing; make a needed character’s appeal and expression visible where the story calls for them.',
  ].join('\n');
}
