/* ============================================================================
   The bird answering as Jack.

   Streams from the existing /api/ask route, and says so plainly rather than
   inventing an answer when the route is down.

   This was written out three times: once on the spine, once on a project page,
   and it was about to be written a third time for the index. Every copy of it
   was byte-identical, which is the shape of a thing that should be imported.
   ========================================================================== */

const NO_ANSWER = 'I did not catch that. Ask me another way.';

/** Post one question and read the whole stream back as a single string. */
export async function askJack(question: string): Promise<string> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: question, history: [] })
  });
  if (!res.ok || !res.body) throw new Error(String(res.status));
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let acc = '';
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    acc += dec.decode(r.value, { stream: true });
  }
  return acc.trim() || NO_ANSWER;
}
