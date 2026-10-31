// Accounting for the existing host-run game, NOT server validation of gameplay.
export function createMatchProgression({ rpc, storage }) {
  const prefix = (id) => `tcg:match-result:${id}:`;
  const inflight = new Map();
  const record = (profileId, result) => {
    const key = prefix(profileId) + result.gameId;
    if (inflight.has(key)) return inflight.get(key);
    const pending = (async () => {
      const saved = storage.getItem(key);
      const request = saved ? JSON.parse(saved) : result;
      storage.setItem(key, JSON.stringify(request));
      const { data, error } = await rpc('tcg_record_host_result', {
        p_game: request.gameId,
        p_mode: request.mode,
        p_won: request.won,
        p_match: request.match,
      });
      if (error) throw error;
      if (data?.economy?.profile_id !== profileId || data?.receipt?.game_id !== request.gameId)
        throw new Error('Match account changed. Sign in again to recover your result.');
      storage.removeItem(key);
      return data;
    })();
    inflight.set(key, pending);
    pending.finally(() => inflight.delete(key)).catch(() => {});
    return pending;
  };
  const recover = async (profileId) => {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key) =>
      key?.startsWith(prefix(profileId))
    );
    let latest = null;
    for (const key of keys) latest = await record(profileId, JSON.parse(storage.getItem(key)));
    return latest;
  };
  return { record, recover };
}
