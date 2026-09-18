type LetterLike = { id: string; unread: boolean };
type PrintJobLike = { letterId: string; status: string };

export function countSentLetters(letters: LetterLike[], jobs: PrintJobLike[]) {
  const completedLetterIds = new Set(
    jobs.filter((job) => job.status === 'completed').map((job) => job.letterId),
  );
  // Records created before print-job persistence used unread=false as their
  // only durable completion signal. Do not use unread count for modern jobs.
  return completedLetterIds.size || letters.filter((letter) => !letter.unread).length;
}
