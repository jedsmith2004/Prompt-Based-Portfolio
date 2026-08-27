/* ============================================================================
   The bird answering as Jack.

   Streams from the existing /api/ask route, and says so plainly rather than
   inventing an answer when the route is down.

   This was written out three times: once on the spine, once on a project page,
   and it was about to be written a third time for the index. Every copy of it
   was byte-identical, which is the shape of a thing that should be imported.

   IT HAS TO PARSE THE STREAM, NOT CONCATENATE IT.

   Jack, 2026-08-27: 'if you ask him a question he says: content:"." data:
   content:"What" data:...'

   That is exactly what the route sends and exactly what the old version of
   this file did with it, which was nothing. /api/ask is an SSE endpoint: it
   sets `text/event-stream` and writes one frame per token, in the form

       data: {"content":"What"}\n\n

   The first cut here read the body to the end and returned the raw text, so
   the bird recited the wire protocol — every `data:` prefix, every brace and
   every quotation mark — one token at a time. It was not a formatting slip in
   the bubble; the string handed to the bubble genuinely was the transcript of
   the HTTP response.

   THE TWO THINGS THAT MAKE THIS MORE THAN A `split('\n')`.

   A read does not arrive on a frame boundary. `{"content":"What"}` can and
   does get split across two chunks, so the parser keeps a buffer and only
   consumes up to the last newline it has actually seen; whatever is left over
   is carried into the next read. Splitting each chunk independently silently
   drops any token unlucky enough to straddle a boundary, which is the kind of
   bug that looks like the model occasionally missing a word.

   And a frame is not always JSON. `[DONE]`, comment lines beginning `:` that
   some proxies inject as keep-alives, and blank separator lines are all legal
   and none of them parse. Anything that is not a well-formed data frame is
   skipped rather than thrown, because one malformed frame is not a reason to
   lose an answer that is otherwise complete.
   ========================================================================== */

const NO_ANSWER = 'I did not catch that. Ask me another way.';

/** Pull the text out of one `data:` payload. Returns '' for anything else. */
function contentOf(payload: string): string {
  if (!payload || payload === '[DONE]') return '';
  try {
    const parsed = JSON.parse(payload);
    /* The route normalises to `{ content }`, but accept the upstream
       OpenAI-dialect shape too: it costs one expression and it means a change
       at the route that forwards deltas straight through cannot break this. */
    const text =
      typeof parsed?.content === 'string'
        ? parsed.content
        : parsed?.choices?.[0]?.delta?.content;
    return typeof text === 'string' ? text : '';
  } catch {
    return '';
  }
}

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
  let buffer = '';
  let answer = '';

  /** Consume every complete line in the buffer, leaving any partial tail. */
  const drain = (final: boolean) => {
    for (;;) {
      const nl = buffer.indexOf('\n');
      /* On the last pass there is no trailing newline to wait for, so whatever
         is left is a complete line by definition. */
      if (nl < 0) {
        if (!final) return;
        const rest = buffer.trim();
        buffer = '';
        if (rest.startsWith('data:')) answer += contentOf(rest.slice(5).trim());
        return;
      }
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line.startsWith('data:')) answer += contentOf(line.slice(5).trim());
    }
  };

  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    buffer += dec.decode(r.value, { stream: true });
    drain(false);
  }
  buffer += dec.decode();
  drain(true);

  return answer.trim() || NO_ANSWER;
}
