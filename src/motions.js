// Seed motion bank + topic inference.
// MOTIONS: curated tournament motions (bundled). Users add more via the in-app
// Calico importer (which calls /api/motions) or by logging their own.

export const SEED_MOTIONS = [
  {
    id: 'waterlooiv2026-r1',
    motion: 'THS the popularization of the FIRE movement',
    tag: '🔥',
    round: 'Round 1',
    tournament: 'Waterloo IV 2026',
    infoSlide: 'The Financial Independence, Retire Early (FIRE) movement is a personal finance phenomenon amongst young people, characterized by high savings rate and aggressive investment, with the goal of accumulating sufficient assets to cover living expenses without traditional employment.',
    sideBias: { gov: 1.56, opp: 1.44 },
    topic: 'Money vs Happiness',
    source: 'Waterloo IV 2026',
  },
  {
    id: 'waterlooiv2026-r2',
    motion: 'THR the rise of auteur cinema',
    tag: 'tarantino',
    round: 'Round 2',
    tournament: 'Waterloo IV 2026',
    infoSlide: 'Auteur cinema refers to filmmaking in which the director is seen as the primary creative author of the film, expressing consistent style, vision, or themes across their work. Since the 1990s, auteur cinema has seen a rise in which various directors have gained prominence (Quentin Tarantino, Jordan Peele, Wes Anderson, Greta Gerwig), with the emergence of dedicated fanbases for specific directors, and studios placing stronger emphasis on the director when marketing films.',
    sideBias: { gov: 1.28, opp: 1.72 },
    topic: 'Social Justice Stock Arguments',
    source: 'Waterloo IV 2026',
  },
  {
    id: 'waterlooiv2026-r3',
    motion: 'THR the decline of the Italian-American mafia',
    tag: 'the godfather',
    round: 'Round 3',
    tournament: 'Waterloo IV 2026',
    infoSlide: 'The Italian-American mafia are highly hierarchical criminal organizations divided into regional branches called "families". They are notable in their strict "omerta code" which enforces strict loyalty to the family, prohibition on any police cooperation, and non-interference with the criminal activities of other "made" members of the mafia. Since the 1980s the Mafia has decreased by over 50%.',
    sideBias: { gov: 1.39, opp: 1.61 },
    topic: 'Leadership Decapitation',
    source: 'Waterloo IV 2026',
  },
  {
    id: 'waterlooiv2026-r4',
    motion: 'THP polycules to monogamous relationships as the standard relationship model',
    tag: 'poly',
    round: 'Round 4',
    tournament: 'Waterloo IV 2026',
    infoSlide: 'A polycule refers to a committed relationship between more than 2 people. They can include every member being committed to one another, multiple people being committed to one person, or any combination/in between.',
    sideBias: { gov: 1.28, opp: 1.72 },
    topic: 'Social Justice Stock Arguments',
    source: 'Waterloo IV 2026',
  },
  {
    id: 'waterlooiv2026-r5',
    motion: 'THS a middle power (e.g. Canada, South Korea) rejection of universal multilateralism',
    tag: 'carney out',
    round: 'Round 5',
    tournament: 'Waterloo IV 2026',
    infoSlide: 'Universal multilateralism is an approach to international relations which emphasizes the enforcement of a rules based international order through global institutions (e.g. WTO, UN, World Bank) with the goal of equal participation of all nations and global collaboration.',
    sideBias: { gov: 0.83, opp: 2.17 },
    topic: 'Free Trade',
    source: 'Waterloo IV 2026',
  },
  {
    id: 'waterlooiv2026-semis',
    motion: "THR the emergence of Muhasasa Ta'ifia in Iraq",
    tag: "muhasasa ta'ifia",
    round: 'Semifinals',
    tournament: 'Waterloo IV 2026',
    infoSlide: '"Muhasasa Ta\'ifa" is the informal power-sharing agreement between the different ethno-religious groups of Iraq which emerged in the country after the fall of the Ba\'athist government in 2003. Government positions are delegated to specific groups (the prime minister is Shia Arab, the president is Kurdish, the speaker of the house is Sunni-Arab); parliamentary seats are allotted to different ethno-religious groups roughly based on population; control over ministries is delegated to specific groups. Iraq\'s population is approximately 60% Shia-Arab, 15-20% Sunni-Arab, 15-20% Kurdish.',
    sideBias: null,
    topic: 'Federalization',
    source: 'Waterloo IV 2026',
  },
  {
    id: 'waterlooiv2026-novicefinals',
    motion: 'THO the cultural value placed on obscurity in consumer choice and taste curation (fashion, cuisine, media)',
    tag: 'japanese selvedge denim',
    round: 'Novice Finals',
    tournament: 'Waterloo IV 2026',
    infoSlide: null,
    sideBias: null,
    topic: 'Money vs Happiness',
    source: 'Waterloo IV 2026',
  },
  {
    id: 'waterlooiv2026-grandfinal',
    motion: 'THW press the crimson button',
    tag: 'angloapocalypse',
    round: 'Grand Final',
    tournament: 'Waterloo IV 2026',
    infoSlide: "There is a crimson button that when pressed would replace everyone's fluency and literacy in their native language with English - and all text in the world would immediately be translated into English. In exchange, everyone also loses the ability to speak and read all other languages.",
    sideBias: null,
    topic: 'Philosophical Stock Arguments',
    source: 'Waterloo IV 2026',
  },
];

// Keyword -> library topic. Used to auto-tag motions (logged or imported) so
// "drill from a motion" can find matching stock arguments. First match wins;
// order from most-specific to most-general.
const TOPIC_KEYWORDS = [
  [/\b(sanction|embargo)\b/i, 'Sanctions'],
  [/\b(drone|airstrike)\b/i, 'Drone Strikes'],
  [/\b(invad|invasion|occupation|military intervention)\b/i, 'Military Invasions'],
  [/\b(assassinat|decapitat|kill the leader|mafia|cartel|organized crime|gang)\b/i, 'Leadership Decapitation'],
  [/\b(nationaliz|privatiz|state-owned|state owned|soe)\b/i, 'Nationalization'],
  [/\b(bailout)\b/i, 'Bailouts'],
  [/\b(too big to fail|sifi|systemically important|investment bank)\b/i, 'Too Big To Fail'],
  [/\b(tariff|free trade|protectionis|multilateral|wto|trade war|decoupl)\b/i, 'Free Trade'],
  [/\b(inflation|interest rate|central bank|monetary)\b/i, 'Inflation'],
  [/\b(union|labor right|labour right|minimum wage|gig work)\b/i, 'Labor Rights'],
  [/\b(resource curse|dutch disease|petro|oil-rich|oil rich)\b/i, 'Resource Curse'],
  [/\b(currency|dollar|exchange rate|reserve currency)\b/i, 'Currency Strength'],
  [/\b(fdi|foreign direct invest|multinational|mnc)\b/i, 'FDI/MNCs'],
  [/\b(urbaniz|city|cities|slum|megacit)\b/i, 'Urbanization'],
  [/\b(zoning|housing|nimby|rent)\b/i, 'Residential Zoning'],
  [/\b(censor|content moderation|platform|deplatform|de-platform)\b/i, 'Censorship'],
  [/\b(free speech|freedom of speech|hate speech|expression)\b/i, 'Free Speech Restrictions'],
  [/\b(social media|twitter|x\.com|facebook|instagram|tiktok)\b/i, 'Social Media Censorship'],
  [/\b(prison|incarcerat|sentenc|criminal justice|police|policing|carceral|recidivis)\b/i, 'Justice System'],
  [/\b(legaliz|criminaliz|drug|narcotic|sex work|prostitution)\b/i, 'Legalization vs Criminalization'],
  [/\b(democracy|democratic|voting|electoral|suffrage|referendum)\b/i, 'Pro-Democracy Principles'],
  [/\b(federal|decentraliz|devolution|secession|power-sharing|power sharing|ethno-religious|ethnic quota)\b/i, 'Federalization'],
  [/\b(open border|immigration|migrant|refugee)\b/i, 'Open Borders'],
  [/\b(religio|church|faith|god|secular|proselytiz)\b/i, 'Religion'],
  [/\b(affirmative action|admissions|university|college|higher education)\b/i, 'College Admissions'],
  [/\b(space|mars|nasa|satellite|orbit)\b/i, 'Space Exploration'],
  [/\b(money|wealth|rich|income|fire movement|retire|financial independence|consumer|taste|obscurity|fashion|cuisine)\b/i, 'Money vs Happiness'],
  [/\b(movement|protest|activis|social justice|polycul|monogam|relationship|marriage|cinema|auteur|film|media|director)\b/i, 'Social Justice Stock Arguments'],
  [/\b(autonomy|free will|consent|trolley|veil of ignorance|thought experiment|language|crimson button)\b/i, 'Philosophical Stock Arguments'],
];

export function inferTopic(motionText, infoSlide = '') {
  const hay = `${motionText} ${infoSlide || ''}`;
  for (const [re, topic] of TOPIC_KEYWORDS) {
    if (re.test(hay)) return topic;
  }
  return null; // no confident match -> caller can leave untagged / let user pick
}
