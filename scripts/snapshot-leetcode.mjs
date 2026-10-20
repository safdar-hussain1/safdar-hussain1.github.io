// Takes the figures LeetCode publishes for the profile and writes them, dated, to
// src/data/leetcode-snapshot.json. The page shows exactly these; nothing is fetched by visitors.
//   node scripts/snapshot-leetcode.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USER = 'safdar-hussain1';
const QUERY = `query($u: String!) {
  matchedUser(username: $u) {
    username
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    languageProblemCount { languageName problemsSolved }
    tagProblemCounts {
      advanced { tagName problemsSolved }
      intermediate { tagName problemsSolved }
      fundamental { tagName problemsSolved }
    }
  }
  allQuestionsCount { difficulty count }
}`;

const res = await fetch('https://leetcode.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Referer: `https://leetcode.com/u/${USER}/`, 'User-Agent': 'Mozilla/5.0' },
  body: JSON.stringify({ query: QUERY, variables: { u: USER } }),
});
if (!res.ok) throw new Error(`LeetCode answered ${res.status}`);
const { data, errors } = await res.json();
if (errors || !data?.matchedUser) throw new Error(`LeetCode refused: ${JSON.stringify(errors ?? data)}`);
const m = data.matchedUser;
const by = (d) => m.submitStatsGlobal.acSubmissionNum.find((x) => x.difficulty === d)?.count ?? 0;
const total = (d) => data.allQuestionsCount.find((x) => x.difficulty === d)?.count ?? 0;
const tags = [...m.tagProblemCounts.fundamental, ...m.tagProblemCounts.intermediate, ...m.tagProblemCounts.advanced]
  .map((t) => ({ name: t.tagName, solved: t.problemsSolved }))
  .sort((a, b) => b.solved - a.solved);
const snapshot = {
  fetchedAt: new Date().toISOString(),
  username: m.username,
  url: `https://leetcode.com/u/${USER}/`,
  solved: { all: by('All'), easy: by('Easy'), medium: by('Medium'), hard: by('Hard') },
  total: { all: total('All'), easy: total('Easy'), medium: total('Medium'), hard: total('Hard') },
  languages: m.languageProblemCount.map((l) => ({ name: l.languageName === 'Python3' ? 'Python' : l.languageName, solved: l.problemsSolved })).sort((a, b) => b.solved - a.solved),
  tags: tags.slice(0, 8),
};
const out = join(root, 'src/data/leetcode-snapshot.json');
writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`${snapshot.username}: ${snapshot.solved.all} solved (${snapshot.solved.easy} easy, ${snapshot.solved.medium} medium, ${snapshot.solved.hard} hard) of ${snapshot.total.all}; ${snapshot.languages.map((l) => `${l.name} ${l.solved}`).join(', ')}`);
console.log(`Wrote ${out.replace(root + '/', '')}, fetched ${snapshot.fetchedAt}`);
