/**
 * Modern instance IDs are decisive. Only a reference without a modern ID may
 * use a nonempty legacy UID; two absent IDs must never identify the same card.
 * Shared by wire resolution and ownership validation so deserialization cannot
 * erase a conflicting modern ID by substituting a legacy match first.
 */
export const matchesCardIdentity = (card, reference) => {
  if (!card || !reference) return false;
  const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
  const modern = reference.instanceId;
  if (modern !== undefined && modern !== null && modern !== '') {
    return nonempty(modern) && card.instanceId === modern;
  }
  return nonempty(reference.uid) && card.uid === reference.uid;
};
