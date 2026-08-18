"use client";
/**
 * DemandChainView — embeds the full BiologicalChainPage as the
 * "Demand Chain" tab inside the Breeding Cycle module.
 *
 * The BiologicalChainPage computes the backward chain from the catching plan
 * and shows the GP flock fleet supply vs demand gap analysis.
 */

import { BiologicalChainPage } from "@/components/BiologicalChain/BiologicalChainPage";

export function DemandChainView() {
  return <BiologicalChainPage />;
}
