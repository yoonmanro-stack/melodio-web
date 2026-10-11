/** Client-safe action recognition shared by fresh and persisted story plans. */
// This establishes a readable planned action, never generated-video quality.
const observableActions = [
  /딛|걷|걸어|돌리|돌아|닫|열|옮|집어|잡|놓|밀|당기|들어|들고|내리|올리|가리|멈|앉|일어|누르|펴|접|뻗|건네|꺼내|넣|빼|벗|메고|씌|빗|씹|먹|마시|찍|덮|훑|응시|바라(?:보|본|볼|봤)|웃|찡그|고개|눈썹/,
  /흔(?:들|드|든|듭)|끄덕|모(?:으|아|았|은|을|읍)|펼(?:치|쳐|쳤|친|칠|칩)/,
  // A word boundary keeps abstract 좌절한다 from counting as a bow.
  /(?:^|[^가-힣])(?:큰)?절(?:을)?\s*(?:하|한|했|해|합|할|올리|올린)|(?:인사|경례|목례)(?:를)?\s*(?:하|한|했|해|합|할|올리|올린|건네)/,
  /숙(?:이|여|였|인|일|입)|굽(?:히|혀|혔|힌|힐|힙)|두드(?:리|려|렸|린|릴|립)|두들(?:기|겨|겼|긴|길|깁)/,
  /뛰|뛴|뛸|뜀|달(?:리|려|렸|린|릴|립)|움직(?:이|여|였|인|일|임)|춤(?:을)?\s*(?:추|춰|췄|춘|출|춥)/,
  // Writing needs a tangible written object, rather than abstract 마음을 쓴다.
  /(?:글(?:씨|자)?|문장|이름|서명|숫자|한글|메모|기록|붓글씨|문서|편지|서신)(?:을|를)?\s*(?:[가-힣]+\s+){0,3}(?:쓰|써|썼|쓴|쓸|적(?:는|어|었|으|고)|기입)/,
  /(?:종이|장부|공책|수첩|노트|문서|서류|서신|봉투|칠판|화면|편지)(?:에|위에)\s*(?:[가-힣]+\s+){0,3}(?:쓰|써|썼|쓴|쓸|적(?:는|어|었|으|고)|(?:메모|필기|서명|기입)(?:를)?\s*(?:하|한|했|해|합|할))/,
  // Drawing requires a pictured object or a drawing tool, not 마음/꿈을 그린다.
  /(?:그림|초상화|풍경화|스케치|도형)(?:을|를)?\s*(?:[가-힣]+\s+){0,3}그(?:리|려|렸|린|릴|립)|(?:붓|펜|연필|볼펜)(?:으로|로)\s*(?:[가-힣]+\s+){0,3}(?:그(?:리|려|렸|린|릴|립)|(?:메모|필기|서명|기입)(?:를)?\s*(?:하|한|했|해|합|할))/,
];

export function hasObservableCategoryAction(value: string): boolean {
  return observableActions.some(action => action.test(value));
}
