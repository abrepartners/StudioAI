interface RevisionCompositePolicyInput {
  fromPack: boolean;
  isRestageWithRemoval: boolean;
  isSpatialMove: boolean;
}

export function shouldSkipCompositeForRevision({
  fromPack,
  isRestageWithRemoval,
  isSpatialMove,
}: RevisionCompositePolicyInput): boolean {
  return fromPack || isRestageWithRemoval || isSpatialMove;
}
