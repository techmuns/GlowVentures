import type { Portfolio } from "@/lib/types";
import type { PrivateValueModel } from "@/lib/privateValue";

// Props the Overview and Startups segments receive from the page shell. The
// shell derives the book once and hands the same numbers to each, so the
// segments can't drift apart the way the three separate pages did.
//
// The per-class fund tabs take a narrower prop set — see FundClass.
export type SegmentProps = {
  portfolio: Portfolio;
  model: PrivateValueModel;
  /** Compact money formatter in the selected display currency. */
  money: (n: number, sign?: boolean) => string;
};
