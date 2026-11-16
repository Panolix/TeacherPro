/**
 * Resolves the lesson topic to apply after inserting an AI lesson draft.
 *
 * Priority:
 * 1. A topic the user explicitly typed in the draft dialog (anything that
 *    differs from the seeded value).
 * 2. The title the model chose for the draft.
 * 3. The seeded topic, when the model returned no title at all.
 */
export function resolveDraftTitle(
  enteredTopic: string,
  seededTopic: string,
  resultTitle: string,
): string {
  const entered = enteredTopic.trim();
  const seeded = seededTopic.trim();
  const title = resultTitle.trim();

  if (entered && entered !== seeded) return entered;
  return title || entered;
}
