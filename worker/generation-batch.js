const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only a complete primary lineage may create the B candidate of that input. */
function generationBatchSiblingFields(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('generation_batch_lineage_invalid');
  }
  const id = row.generation_batch_id;
  const index = row.generation_batch_index;
  const slot = row.generation_candidate_slot;
  if (id == null && index == null && slot == null) return {};
  if (typeof id !== 'string' || !UUID.test(id)
    || !Number.isInteger(index) || index < 0 || index >= 40 || slot !== 'A') {
    throw new Error('generation_batch_lineage_invalid');
  }
  return {
    generation_batch_id: id,
    generation_batch_index: index,
    generation_candidate_slot: 'B',
  };
}

module.exports = { generationBatchSiblingFields };
