// Whether a finished run belongs in the local high-score list. A run that
// scored nothing (start and lose immediately) is noise, not a record.
export function isRecordableRun(score: number): boolean {
  return score > 0;
}
