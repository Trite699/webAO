
interface ParsedIni {
  [section: string]: { [key: string]: string };
}

const regexPatterns = {
  section: /^\s*\[\s*([^\]]*)\s*\]\s*$/,
  // Keys may contain / and \ : some char.inis write per-frame effects in a
  // flattened QSettings form, e.g. "[anim]" with keys like
  // "Rap_FrameSFX\15" or "wit_bulky/Rap_FrameSFX\12" (Rimes). Without
  // these characters allowed, those lines were silently dropped.
  param: /^\s*([\w.\-_/\\]+)\s*=\s*(.*?)\s*$/,
  comment: /^\s*;.*$/,
};

const valueHandler = (matchKey: string, matchValue: string): string => {
  // Preserve original case for shownames and for shout names/messages
  // ([Shouts] keys like Custom_Message), so the IC log can show e.g.
  // "Apollo shouts GOTCHA!" with the author's casing.
  if (
    matchKey === "showname" ||
    matchKey.endsWith("_message") ||
    matchKey.endsWith("_name")
  ) {
    return matchValue;
  }
  return matchValue.toLowerCase();
};

const lineFilter = (value: string): boolean => {
  const isEmpty: boolean = value.length === 0;
  const isComment: boolean = regexPatterns.comment.test(value);

  if (isComment || isEmpty) {
    return false;
  }
  return true;
};

const iniParse = (data: string): ParsedIni => {
  const parsedIni: ParsedIni = {};
  const lines: string[] = data.split(/\r\n|\r|\n/);
  const filteredLines: string[] = lines.filter(lineFilter);

  let currentSection: string | undefined;

  filteredLines.forEach((line) => {
    const isParameter: boolean = regexPatterns.param.test(line);
    const isSection: boolean = regexPatterns.section.test(line);
    if (isParameter && currentSection) {
      const match: RegExpMatchArray | null = line.match(regexPatterns.param);

      if (match) {
        const matchKey: string = match[1].toLowerCase();
        const matchValue: string = match[2];
        parsedIni[currentSection][matchKey] = valueHandler(matchKey, matchValue);
      }
    } else if (isSection) {
      const match: RegExpMatchArray | null = line.match(regexPatterns.section);

      if (match) {
        const matchKey: string = match[1].toLowerCase();
        parsedIni[matchKey] = {};
        currentSection = matchKey;
      }
    }
  });

  return parsedIni;
};

export default iniParse;
